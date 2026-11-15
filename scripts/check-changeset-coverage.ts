#!/usr/bin/env bun
/**
 * Fails when something a package publishes has changed without a changeset
 * naming that package.
 *
 * A package counts as changed only when what users receive from it can change:
 *
 * - a file in its tarball: what its `files` field lists, plus the files npm
 *   always includes (README, LICENSE, the `main` file, `bin` files). A package
 *   without `files` publishes its whole directory, so any file in it counts;
 * - a source its build turns into tarball content, listed in
 *   `.changeset/published-sources.json` (the tarball's own `dist/` is built,
 *   not committed, so its sources stand in for it);
 * - a `package.json` field that reaches users, compared by parsed value
 *   between the merge base and the working tree. Every field counts except
 *   the tooling-only ones in {@link TOOLING_FIELDS}: `dependencies`,
 *   `peerDependencies`, `peerDependenciesMeta`, `optionalDependencies`,
 *   `bundleDependencies`, `exports`, `imports`, `main`, `module`, `types`,
 *   `bin`, `engines`, `os`, `cpu`, `files`, `type`, `sideEffects`, `version`,
 *   `publishConfig`, `license` and the rest of the npm metadata, and the
 *   install hooks in `scripts`.
 *
 * So a change to `devDependencies` or to the build scripts, or to a file that
 * never ships (tests, fixtures, configs of tools that do not build the
 * tarball), needs no changeset.
 *
 * `changeset status --since=<ref>` cannot make that distinction: it counts any
 * file under a package's directory. It also does not check *which* packages the
 * changesets name, so editing `packages/mui` while declaring only `@meonode/ui`
 * passes it; the mui fix then ships nothing. This check names each package.
 *
 * Usage:
 *   bun run scripts/check-changeset-coverage.ts [since-ref]   # default origin/main
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { getPackages } from '@manypkg/get-packages'
import { getChangedChangesetFilesSinceRef, getChangedFilesSince, getDivergedCommit } from '@changesets/git'
import readChangesets from '@changesets/read'

const cwd = process.cwd()
const since = process.argv[2] ?? 'origin/main'

type Manifest = Record<string, unknown>

/**
 * `package.json` fields that never reach a user of the published package: npm
 * ignores them in an installed dependency, and only this repository's tools
 * read them. `scripts` is handled separately, because its install hooks do run
 * on a user's machine.
 */
const TOOLING_FIELDS = new Set([
  'devDependencies',
  'workspaces',
  'packageManager',
  'trustedDependencies',
  'devEngines',
  'overrides',
  'resolutions',
  'prettier',
  'eslintConfig',
  'lint-staged',
])

/** The scripts npm runs when a user installs the package. */
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'] as const

/** A JSON value with object keys sorted, so key order cannot count as a change. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )

/** What of a manifest reaches users, as one comparable value per field. */
function publishedFields(manifest: Manifest): Map<string, string> {
  const fields = new Map<string, string>()
  for (const [key, value] of Object.entries(manifest)) {
    if (TOOLING_FIELDS.has(key) || key === 'scripts') continue
    fields.set(key, canonical(value))
  }
  const scripts = (manifest.scripts ?? {}) as Record<string, unknown>
  for (const hook of INSTALL_SCRIPTS) {
    if (hook in scripts) fields.set(`scripts.${hook}`, canonical(scripts[hook]))
  }
  return fields
}

/** The `package.json` fields whose published value differs between two manifests. */
function changedFields(base: Manifest, head: Manifest): string[] {
  const before = publishedFields(base)
  const after = publishedFields(head)
  return [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key)).sort()
}

const stripDotSlash = (p: string) => p.replace(/^\.\//, '').replace(/\/+$/, '')

/**
 * Whether npm would put `rel` (relative to the package directory) in the
 * tarball of a package with this manifest.
 */
function isPublished(rel: string, manifest: Manifest): boolean {
  if (rel === 'package.json') return false // compared field by field instead
  const files = manifest.files as string[] | undefined
  if (files === undefined) return true
  if (!rel.includes('/') && /^(readme|license|licence)(\..*)?$/i.test(rel)) return true
  const entryPoints = [manifest.main, ...(typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {}))]
  if (entryPoints.some(p => typeof p === 'string' && stripDotSlash(p) === rel)) return true

  let included = false
  for (const raw of files) {
    const negated = raw.startsWith('!')
    const entry = stripDotSlash(negated ? raw.slice(1) : raw)
    // An entry names a file or a directory; a glob also includes the contents of
    // any directory it matches.
    const ancestry = rel.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))
    const matches = /[*?[{]/.test(entry) ? ancestry.some(p => new Bun.Glob(entry).match(p)) : rel === entry || rel.startsWith(`${entry}/`)
    if (matches) included = !negated
  }
  return included
}

/**
 * Repo paths that a package's build turns into tarball content, by package name.
 * An entry ending in `/` matches a directory; anything else must match exactly.
 */
function readPublishedSources(): Record<string, string[]> {
  const file = path.join(cwd, '.changeset/published-sources.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>) : {}
}

const matchesSource = (file: string, entry: string) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry)

const changesetId = (file: string) => path.basename(file, '.md')

const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })

/** A file's contents at a commit, or undefined when it did not exist there. */
function showAt(commit: string, file: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${commit}:${file}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return undefined
  }
}

const base = await getDivergedCommit(cwd, since)

/**
 * The changesets that already existed where this branch left `since`.
 *
 * Read from the merge-base commit rather than from a diff, because a diff only
 * sees tracked files: run before committing — which is exactly when someone
 * wants to know whether they remembered a changeset — a freshly written one is
 * still untracked and would be invisible.
 */
const inherited = new Set(
  git('ls-tree', '-r', '--name-only', base, '--', '.changeset')
    .split('\n')
    .filter(file => file.endsWith('.md'))
    .map(changesetId),
)

const [{ packages }, changedFiles, editedChangesetFiles, allChangesets] = await Promise.all([
  getPackages(cwd),
  getChangedFilesSince({ cwd, ref: since }),
  getChangedChangesetFilesSinceRef({ cwd, ref: since }),
  readChangesets(cwd),
])

const sources = readPublishedSources()

// With no lockfile to detect the package manager by, @manypkg/get-packages falls back
// to the root package alone, and every package would silently count as unchanged.
if (!packages.some(p => !p.packageJson.private)) {
  console.error(`Found no publishable packages under ${cwd}, so nothing could be checked.`)
  process.exit(1)
}

/** Each publishable package whose published content changed, with what changed. Private packages are never published. */
const changed = new Map<string, string[]>()
for (const pkg of packages) {
  if (pkg.packageJson.private) continue
  const name = pkg.packageJson.name
  const dir = path.relative(cwd, pkg.dir).split(path.sep).join('/')
  const head = pkg.packageJson as unknown as Manifest
  const baseText = showAt(base, `${dir}/package.json`)
  const baseManifest = baseText === undefined ? undefined : (JSON.parse(baseText) as Manifest)

  const reasons: string[] = []
  if (baseManifest === undefined) {
    reasons.push('new package')
  } else {
    reasons.push(...changedFields(baseManifest, head).map(field => `package.json ${field}`))
  }
  for (const file of changedFiles) {
    const rel = file.startsWith(`${dir}/`) ? file.slice(dir.length + 1) : undefined
    // A file in the package counts if either side publishes it: added to, or dropped from, the tarball.
    const inTarball = rel !== undefined && (isPublished(rel, head) || (baseManifest !== undefined && isPublished(rel, baseManifest)))
    const isSource = (sources[name] ?? []).some(entry => matchesSource(file, entry))
    if (inTarball || isSource) reasons.push(file)
  }
  if (reasons.length > 0) changed.set(name, reasons)
}

/**
 * Only the changesets this branch introduced or edited count.
 *
 * `readChangesets` returns every unreleased changeset in the directory, which
 * between releases includes the ones earlier merged pull requests left behind.
 * Judging a branch by those means it inherits their coverage: a branch that
 * edits `@meonode/ui` and adds nothing passes because some previous branch
 * declared `@meonode/ui`, and a single `--empty` changeset sitting on `main`
 * waives this check for the entire repository until a release consumes it.
 */
const editedIds = new Set(editedChangesetFiles.map(changesetId))
const changesets = allChangesets.filter(c => !inherited.has(c.id) || editedIds.has(c.id))

/**
 * `changeset add --empty` writes a changeset that releases nothing. It says
 * "this change ships no package", so it satisfies the check — but only when it
 * is what this branch is actually saying. A branch that also adds a real
 * changeset is claiming a release, and every package it changed has to be named
 * in one.
 */
if (changesets.length > 0 && changesets.every(c => c.releases.length === 0)) {
  console.log('An empty changeset declares that this change releases nothing.')
  process.exit(0)
}

const declared = new Set(changesets.flatMap(c => c.releases.map(r => r.name)))
const undeclared = [...changed.keys()].filter(name => !declared.has(name)).sort()

if (undeclared.length > 0) {
  const list = undeclared.map(n => `  - ${n}, because of:\n${(changed.get(n) ?? []).map(r => `      ${r}`).join('\n')}`).join('\n')
  const declaredList = declared.size > 0 ? [...declared].sort().join(', ') : 'none'
  console.error(
    `\nWhat these packages publish changed since ${since}, but no changeset on this branch releases them:\n${list}\n\n` +
      `Changesets added on this branch release: ${declaredList}\n\n` +
      `Add one with \`bun run changeset\`.\n`,
  )
  process.exit(1)
}

console.log(
  changed.size > 0
    ? `Every package whose published content changed since ${since} is named by a changeset on this branch.`
    : `Nothing a package publishes changed since ${since}, so no changeset is needed.`,
)
