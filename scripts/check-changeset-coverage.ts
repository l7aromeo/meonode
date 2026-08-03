#!/usr/bin/env bun
/**
 * Fails when a publishable package has changed without a changeset naming it.
 *
 * `changeset status --since=<ref>` already fails when a branch changes a
 * package and carries no changeset at all, which catches forgetting outright.
 * It does not check *which* packages the changesets name, so editing
 * `packages/mui` while declaring only `@meonode/ui` passes: a changeset
 * exists, so the branch looks covered. The mui fix then ships nothing, and
 * that only surfaces when someone reports it missing from the released
 * package.
 *
 * The package set and the "what changed" comparison both come from Changesets'
 * own modules, so this cannot disagree with the tool about which files belong
 * to which package — except where a package's sources deliberately live
 * outside its own directory, which {@link OUT_OF_TREE_SOURCES} maps back.
 *
 * Usage:
 *   bun run scripts/check-changeset-coverage.ts [since-ref]   # default origin/main
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { getPackages } from '@manypkg/get-packages'
import { getChangedChangesetFilesSinceRef, getChangedFilesSince, getChangedPackagesSinceRef, getDivergedCommit } from '@changesets/git'
import readChangesets from '@changesets/read'

const cwd = process.cwd()
const since = process.argv[2] ?? 'origin/main'

/**
 * Repo paths that ship inside a package which does not contain them.
 *
 * Changesets maps a changed file to a package by walking up to the nearest
 * `package.json`, which is right for every package whose sources sit under its
 * own directory — and wrong for `@meonode/compiler`. That package is
 * `packages/compiler/npm`, holding nothing but the built wasm artifact, its
 * README and its manifest; everything that decides what the artifact *does*
 * lives one level up, under the private `@meonode/compiler-repo`. So a change
 * to the Rust crate — the whole substance of a compiler release — never
 * registers as a change to the package it ships in, and this check could never
 * ask for a changeset covering it.
 *
 * An entry ending in `/` matches a directory prefix; anything else must match
 * the path exactly.
 */
const OUT_OF_TREE_SOURCES: ReadonlyArray<readonly [path: string, packageName: string]> = [
  // Build inputs of `packages/compiler/npm/meonode_swc_plugin.wasm`.
  ['packages/compiler/crates/', '@meonode/compiler'],
  ['packages/compiler/Cargo.toml', '@meonode/compiler'],
  ['packages/compiler/Cargo.lock', '@meonode/compiler'],
  ['packages/compiler/rust-toolchain.toml', '@meonode/compiler'],
  // Copied into the package by its own `build` script, so it is published content.
  ['packages/compiler/README.md', '@meonode/compiler'],
]

const ownerOf = (file: string): string | undefined =>
  OUT_OF_TREE_SOURCES.find(([entry]) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry))?.[1]

const changesetId = (file: string) => path.basename(file, '.md')

/**
 * The changesets that already existed where this branch left `since`.
 *
 * Read from the merge-base commit rather than from a diff, because a diff only
 * sees tracked files: run before committing — which is exactly when someone
 * wants to know whether they remembered a changeset — a freshly written one is
 * still untracked and would be invisible.
 */
const inheritedChangesetIds = async (): Promise<Set<string>> => {
  const base = await getDivergedCommit(cwd, since)
  const listed = execFileSync('git', ['ls-tree', '-r', '--name-only', base, '--', '.changeset'], { cwd, encoding: 'utf8' })
  return new Set(
    listed
      .split('\n')
      .filter(file => file.endsWith('.md'))
      .map(changesetId),
  )
}

const [{ packages }, changedPackages, changedFiles, editedChangesetFiles, inherited, allChangesets] = await Promise.all([
  getPackages(cwd),
  getChangedPackagesSinceRef({ cwd, ref: since }),
  getChangedFilesSince({ cwd, ref: since }),
  getChangedChangesetFilesSinceRef({ cwd, ref: since }),
  inheritedChangesetIds(),
  readChangesets(cwd),
])

/** Private packages are never published, so they need no changeset. */
const publishable = new Set(packages.filter(p => !p.packageJson.private).map(p => p.packageJson.name))

const changed = new Set<string>()
for (const pkg of changedPackages) {
  if (publishable.has(pkg.packageJson.name)) changed.add(pkg.packageJson.name)
}
for (const file of changedFiles) {
  const owner = ownerOf(file)
  if (owner !== undefined && publishable.has(owner)) changed.add(owner)
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
 * `changeset add --empty` writes a changeset that releases nothing. It is the
 * documented way to say "this change ships no package", so it has to satisfy
 * the check rather than fail it for every package at once — but only when it
 * is what this branch is actually saying. A branch that also adds a real
 * changeset is claiming a release, and every package it touched has to be
 * named in one.
 */
if (changesets.length > 0 && changesets.every(c => c.releases.length === 0)) {
  console.log('An empty changeset declares that this change releases nothing.')
  process.exit(0)
}

const declared = new Set(changesets.flatMap(c => c.releases.map(r => r.name)))

const undeclared = [...changed].filter(name => !declared.has(name)).sort()

if (undeclared.length > 0) {
  const list = undeclared.map(n => `  - ${n}`).join('\n')
  const declaredList = declared.size > 0 ? [...declared].sort().join(', ') : 'none'
  console.error(
    `\nThese packages changed since ${since} but no changeset on this branch releases them:\n${list}\n\n` +
      `Changesets added on this branch release: ${declaredList}\n\n` +
      `Add one with \`bun run changeset\`. If the change genuinely ships nothing,\n` +
      `\`bunx changeset add --empty\` records that instead — it covers the whole\n` +
      `branch, so only use it when none of the changed packages need releasing,\n` +
      `and not alongside a changeset that does release something.\n`,
  )
  process.exit(1)
}

console.log(`Every publishable package changed since ${since} is named by a changeset on this branch.`)
