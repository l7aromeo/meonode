#!/usr/bin/env bun
/**
 * Builds the plugin to wasm and copies it to npm/meonode_swc_plugin.wasm, with
 * every machine-specific path prefix remapped, so one commit built on any
 * machine gives the same bytes.
 *
 * rustc writes source paths into the binary, in panic locations among other
 * places. A dependency's path starts with the cargo home it was unpacked into
 * (`/home/runner/.cargo` on CI, `~/.cargo` on a laptop), and anything generated
 * into the target directory starts with that directory. Each is remapped to a
 * fixed prefix here, and so is the workspace root: cargo passes the workspace's
 * own sources to rustc relative to it, but a crate that writes in its directory
 * (`env!("CARGO_MANIFEST_DIR")`) gets the absolute path. The standard library's
 * paths are fixed by the toolchain, which rust-toolchain.toml pins to an exact
 * version.
 *
 * CI and local builds both run this through `bun run build:wasm`, so the flags
 * have one source.
 *
 * Usage:
 *   bun run scripts/build-wasm.ts
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = 'wasm32-wasip1'
const ARTIFACT = 'meonode_swc_plugin.wasm'

/** Separates flags in `CARGO_ENCODED_RUSTFLAGS`, which allows spaces inside a flag. */
const FLAG_SEPARATOR = '\x1f'

/**
 * Runs a command in the repository root and returns its stdout.
 * @param command The program.
 * @param args Its arguments.
 * @param env The environment, when it differs from this process's.
 * @returns What it printed to stdout.
 * @throws When it cannot start or exits non-zero.
 */
function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  return result.stdout
}

const metadata = JSON.parse(run('cargo', ['metadata', '--format-version', '1', '--no-deps'])) as {
  workspace_root: string
  target_directory: string
}
const cargoHome = process.env.CARGO_HOME ?? join(homedir(), '.cargo')

// rustc applies the last mapping that matches, so the most specific prefix goes last:
// a cargo home or target directory inside the workspace is remapped as itself.
const remaps: [from: string, to: string][] = [
  [metadata.workspace_root, '.'],
  [metadata.target_directory, '/target'],
  [cargoHome, '/cargo'],
]

const inherited = process.env.CARGO_ENCODED_RUSTFLAGS
  ? process.env.CARGO_ENCODED_RUSTFLAGS.split(FLAG_SEPARATOR)
  : (process.env.RUSTFLAGS ?? '').split(' ').filter(Boolean)
const rustflags = [...inherited, ...remaps.map(([from, to]) => `--remap-path-prefix=${from}=${to}`)]

const env: NodeJS.ProcessEnv = { ...process.env, CARGO_ENCODED_RUSTFLAGS: rustflags.join(FLAG_SEPARATOR) }
delete env.RUSTFLAGS

const result = spawnSync('cargo', ['build', '--release', '-p', 'meonode-swc-plugin', '--target', TARGET], {
  cwd: REPO_ROOT,
  env,
  stdio: 'inherit',
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

copyFileSync(join(metadata.target_directory, TARGET, 'release', ARTIFACT), join(REPO_ROOT, 'npm', ARTIFACT))
