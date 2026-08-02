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
 * to which package.
 *
 * Usage:
 *   bun run scripts/check-changeset-coverage.ts [since-ref]   # default origin/main
 */
import { getPackages } from '@manypkg/get-packages'
import { getChangedPackagesSinceRef } from '@changesets/git'
import readChangesets from '@changesets/read'

const cwd = process.cwd()
const since = process.argv[2] ?? 'origin/main'

const [{ packages }, changed, changesets] = await Promise.all([
  getPackages(cwd),
  getChangedPackagesSinceRef({ cwd, ref: since }),
  readChangesets(cwd),
])

/** Private packages are never published, so they need no changeset. */
const publishable = new Set(packages.filter(p => !p.packageJson.private).map(p => p.packageJson.name))

/**
 * `changeset add --empty` writes a changeset that releases nothing. It is the
 * documented way to say "this change ships no package", so it has to satisfy
 * the check rather than fail it for every package at once.
 */
if (changesets.some(c => c.releases.length === 0)) {
  console.log('An empty changeset declares that this change releases nothing.')
  process.exit(0)
}

const declared = new Set(changesets.flatMap(c => c.releases.map(r => r.name)))

const undeclared = changed
  .map(p => p.packageJson.name)
  .filter(name => publishable.has(name) && !declared.has(name))
  .sort()

if (undeclared.length > 0) {
  const list = undeclared.map(n => `  - ${n}`).join('\n')
  const declaredList = declared.size > 0 ? [...declared].sort().join(', ') : 'none'
  console.error(
    `\nThese packages changed since ${since} but no changeset releases them:\n${list}\n\n` +
      `Changesets on this branch release: ${declaredList}\n\n` +
      `Add one with \`bun run changeset\`. If the change genuinely ships nothing,\n` +
      `\`bunx changeset add --empty\` records that instead — it covers the whole\n` +
      `branch, so only use it when none of the changed packages need releasing.\n`,
  )
  process.exit(1)
}

console.log(`Every publishable package changed since ${since} is named by a changeset.`)
