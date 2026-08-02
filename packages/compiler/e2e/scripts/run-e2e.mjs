#!/usr/bin/env node
// Orchestrates Task 12's two e2e fixtures end to end:
//
//   1. bun install each fixture, then overlay the workspace packages:
//      @meonode/compiler is file:-linked against ../../npm, and @meonode/ui is
//      built, packed as npm would publish it, and laid over the registry copy
//      that the fixture's pin installed — so both sides of the parity check
//      come from this checkout rather than from whatever was last released.
//   2. Build each fixture twice: once with the @meonode/compiler swc plugin
//      enabled, once with MEONODE_COMPILER=0 (plugin disabled), renaming the
//      bundler's output directory after each build so both copies survive
//      (bundlers overwrite their output directory on every run).
//   3. Run the matching *-render-compare.mjs script, which extracts the
//      shared test tree's #root-marker subtree from each build and asserts
//      byte-identical HTML/DOM plus the transform-applied guard (marker
//      present when the plugin ran, absent when it didn't).
//
// Wired up as the root `test:e2e` script (bun run test:e2e) — intentionally
// NOT part of the default `bun run test`, since spawning two real bundler
// builds is much slower than the unit/vitest suite.
//
// Next.js is built via Turbopack only here (the fixture's default `build`
// script); `build:webpack` / `build:webpack:no-plugin` exist in
// e2e/next-app/package.json for manual/CI diagnostic use if Turbopack ever
// rejects the plugin, but aren't part of this automated pass.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

const SCRIPTS_DIR = import.meta.dirname
const E2E_DIR = path.resolve(SCRIPTS_DIR, '..')
const NEXT_APP_DIR = path.join(E2E_DIR, 'next-app')
const VITE_APP_DIR = path.join(E2E_DIR, 'vite-app')
const REPO_ROOT = path.resolve(E2E_DIR, '../../..')
const UI_DIR = path.join(REPO_ROOT, 'packages/ui')
const PACK_DIR = path.join(E2E_DIR, '.ui-pack')

function run(cmd, args, cwd, env) {
  console.log(`\n$ (${path.relative(E2E_DIR, cwd) || '.'}) ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
}

async function replaceDir(from, to) {
  await rm(to, { recursive: true, force: true })
  await cp(from, to, { recursive: true })
  await rm(from, { recursive: true, force: true })
}

/**
 * Builds @meonode/ui and packs it exactly as `npm publish` would, returning the
 * tarball path.
 *
 * The fixtures keep an ordinary registry pin for @meonode/ui so that
 * `bun install` still resolves its peer dependencies normally. That pin used to
 * be what the suite actually tested against, which meant these fixtures — whose
 * entire job is proving the compiler and the runtime agree — were comparing the
 * plugin from this checkout against a published runtime, and the pin drifted
 * three minor versions behind before anyone noticed.
 *
 * Packing rather than linking is deliberate. `file:` pointed at packages/ui
 * makes bun follow ui's own `@meonode/compiler` dependency, and these fixtures
 * install outside the workspace, so there is nothing to resolve it against and
 * the install fails outright. A tarball is what consumers actually receive, so
 * it sidesteps that and tests the real artifact at the same time.
 */
async function packWorkspaceUi() {
  console.log('\n=== packing @meonode/ui from this checkout ===')
  // `files` in ui's package.json ships dist/, so it has to exist before packing.
  run('bun', ['run', 'build:ui'], REPO_ROOT)
  await rm(PACK_DIR, { recursive: true, force: true })
  await mkdir(PACK_DIR, { recursive: true })
  run('npm', ['pack', UI_DIR, '--pack-destination', PACK_DIR], E2E_DIR)
  const tarball = (await readdir(PACK_DIR)).find(f => f.endsWith('.tgz'))
  if (!tarball) throw new Error(`npm pack produced no tarball in ${PACK_DIR}`)
  return path.join(PACK_DIR, tarball)
}

/** Replaces a fixture's installed @meonode/ui with the packed workspace build. */
async function overlayUi(fixtureDir, tarball) {
  const dest = path.join(fixtureDir, 'node_modules/@meonode/ui')
  await rm(dest, { recursive: true, force: true })
  await mkdir(dest, { recursive: true })
  // --strip-components=1 drops npm's leading `package/` directory.
  run('tar', ['-xzf', tarball, '-C', dest, '--strip-components=1'], fixtureDir)
}

async function buildTwice({ label, cwd, outDir, buildScript, noPluginScript, onDir, offDir }) {
  console.log(`\n=== ${label}: plugin-on build ===`)
  run('bun', ['run', buildScript], cwd)
  await replaceDir(path.join(cwd, outDir), path.join(cwd, onDir))

  console.log(`\n=== ${label}: plugin-off build ===`)
  run('bun', ['run', noPluginScript], cwd)
  await replaceDir(path.join(cwd, outDir), path.join(cwd, offDir))
}

// `main` in npm/package.json is the wasm file itself, so when it is missing the
// bundlers report the whole package as unresolvable — "Module not found: Can't
// resolve '@meonode/compiler'" — which says nothing about the actual cause.
if (!existsSync(path.join(E2E_DIR, '../npm/meonode_swc_plugin.wasm'))) {
  throw new Error(
    'e2e needs the @meonode/compiler wasm artifact, which has not been built.\n' +
      'Run `bun run build:compiler` from the repo root first.',
  )
}

const uiTarball = await packWorkspaceUi()

console.log('=== bun install: e2e/next-app ===')
run('bun', ['install'], NEXT_APP_DIR)
await overlayUi(NEXT_APP_DIR, uiTarball)

// bun installs a `file:` dep's node_modules entry as a symlink per
// top-level file rather than one directory symlink (see
// link-local-packages.mjs's own header comment for the full story).
// Turbopack's package.json reader can't parse that shape, so normalize
// @meonode/compiler (still file:-linked against ../../npm) into a plain
// directory symlink after every install — bun re-creates the broken shape
// on each `bun install`. @meonode/ui no longer needs this: it's an ordinary
// npm registry dependency now, installed as a normal package directory.
run(
  'node',
  [path.join(SCRIPTS_DIR, 'link-local-packages.mjs'), 'node_modules/@meonode/compiler', '../../npm'],
  NEXT_APP_DIR,
)

console.log('\n=== bun install: e2e/vite-app ===')
run('bun', ['install'], VITE_APP_DIR)
await overlayUi(VITE_APP_DIR, uiTarball)

await buildTwice({
  label: 'next-app (Turbopack)',
  cwd: NEXT_APP_DIR,
  outDir: '.next',
  buildScript: 'build',
  noPluginScript: 'build:no-plugin',
  onDir: '.next-on',
  offDir: '.next-off',
})

await buildTwice({
  label: 'vite-app',
  cwd: VITE_APP_DIR,
  outDir: 'dist',
  buildScript: 'build',
  noPluginScript: 'build:no-plugin',
  onDir: 'dist-on',
  offDir: 'dist-off',
})

console.log('\n=== next-app parity check ===')
run('node', [path.join(SCRIPTS_DIR, 'next-render-compare.mjs')], E2E_DIR)

console.log('\n=== vite-app parity check ===')
run('node', [path.join(SCRIPTS_DIR, 'vite-render-compare.mjs')], E2E_DIR)

console.log('\nOK: e2e Next (Turbopack) + Vite parity fixtures both pass')
