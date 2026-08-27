#!/usr/bin/env bun
/**
 * Preflight for `changeset publish`, run in CI before anything is published.
 *
 * `npm publish --dry-run` is not enough on its own. It packs the tarball and
 * reports what would be sent, but it never evaluates `publishConfig.provenance`
 * — so a package that can only publish from CI dry-runs clean on a laptop and
 * then fails for real. That is not hypothetical: `@meonode/mui` (no provenance)
 * published successfully while `@meonode/ui` and `@meonode/compiler` (both
 * `provenance: true`) died with "Automatic provenance generation not supported
 * for provider: null", leaving a released package whose peer dependency did not
 * exist on the registry.
 *
 * So this checks the two things that actually decide whether a publish survives:
 *
 *   1. Every package asking for provenance is running somewhere that can mint
 *      an attestation. npm needs a recognised CI provider, and on GitHub
 *      Actions it also needs `id-token: write` — without the permission the
 *      OIDC request URL is absent and provenance fails even inside CI.
 *   2. The version is not already on the registry, since `changeset publish`
 *      skips those, and a partially-published release is the state this exists
 *      to prevent.
 *
 * Then it defers to `npm publish --dry-run` for everything it does check:
 * packing, `files`, auth, registry reachability.
 *
 * Exits non-zero on the first problem found, listing all of them.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { getPackages } from '@manypkg/get-packages'

const ROOT = path.resolve(import.meta.dir, '..')

/**
 * The dist-tag `changeset publish` would use.
 *
 * In pre mode it publishes under the pre tag rather than `latest`, which is
 * what keeps a beta from becoming the default install. Mirrored here so the
 * dry run reports the same tag the real publish will use.
 * @returns The dist-tag name.
 */
function releaseTag(): string {
  const preStatePath = path.join(ROOT, '.changeset/pre.json')
  if (!existsSync(preStatePath)) return 'latest'
  const preState = JSON.parse(readFileSync(preStatePath, 'utf8')) as { mode?: string; tag?: string }
  return preState.mode === 'pre' && preState.tag ? preState.tag : 'latest'
}

/**
 * Whether this environment can produce a provenance attestation.
 *
 * Matches what npm itself requires: a CI provider it recognises, plus — on
 * GitHub Actions — the OIDC request URL that only appears when the job has
 * `id-token: write`. A job missing the permission looks like CI but cannot
 * attest, and that distinction is the whole point of checking here.
 * @returns Whether provenance can be generated, and why not when it cannot.
 */
function provenanceSupport(): { ok: boolean; reason: string } {
  if (process.env.GITHUB_ACTIONS === 'true') {
    return process.env.ACTIONS_ID_TOKEN_REQUEST_URL
      ? { ok: true, reason: 'GitHub Actions with id-token: write' }
      : { ok: false, reason: 'GitHub Actions without `id-token: write` — no OIDC token available' }
  }
  if (process.env.GITLAB_CI === 'true') return { ok: true, reason: 'GitLab CI' }
  return { ok: false, reason: 'not running in a CI provider npm can attest from' }
}

/**
 * Whether this exact version is already on the registry.
 * @param name Package name.
 * @param version Version to look for.
 * @returns True when the registry already has it.
 */
function alreadyPublished(name: string, version: string): boolean {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim().length > 0
  } catch {
    // `npm view` exits non-zero when the version does not exist, which is the
    // expected case for something about to be released.
    return false
  }
}

const tag = releaseTag()
const provenance = provenanceSupport()
const { packages } = await getPackages(ROOT)
const publishable = packages.filter(p => !p.packageJson.private)

const problems: string[] = []
const skipped: string[] = []

console.log(`release dry run — dist-tag "${tag}", provenance ${provenance.ok ? 'available' : 'unavailable'} (${provenance.reason})\n`)

for (const pkg of publishable) {
  const { name, version } = pkg.packageJson
  const wantsProvenance = Boolean((pkg.packageJson as { publishConfig?: { provenance?: boolean } }).publishConfig?.provenance)

  if (alreadyPublished(name, version)) {
    skipped.push(`${name}@${version} is already on the registry — publish would skip it`)
    continue
  }

  if (wantsProvenance && !provenance.ok) {
    problems.push(
      `${name}@${version} sets publishConfig.provenance but ${provenance.reason}.\n` +
        `    npm would fail with "Automatic provenance generation not supported".\n` +
        `    Publish it from the Release workflow, which has id-token: write.`,
    )
    continue
  }

  try {
    execFileSync('npm', ['publish', '--dry-run', '--tag', tag], {
      cwd: pkg.dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log(`  ok   ${name}@${version} -> ${tag}${wantsProvenance ? ' (with provenance)' : ''}`)
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? String(error)
    problems.push(`${name}@${version} failed \`npm publish --dry-run\`:\n${stderr.trim()}`)
  }
}

for (const line of skipped) console.log(`  skip ${line}`)

if (problems.length > 0) {
  console.error(`\n${problems.length} package(s) would fail to publish:\n`)
  for (const problem of problems) console.error(`  - ${problem}\n`)
  process.exit(1)
}

console.log('\nEvery publishable package would publish cleanly.')
