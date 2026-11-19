#!/usr/bin/env bun
/**
 * Builds the plugin to wasm and copies it to npm/meonode_swc_plugin.wasm, with
 * every machine-specific path prefix remapped, so one commit built on any
 * machine of the same host type gives the same bytes.
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
 * The host type (OS and CPU) still reaches the bytes. Cargo's `-C metadata` for
 * a wasm crate hashes in its build scripts and proc macros, which are built for
 * the host (rust-lang/cargo#8140), and with LTO rustc orders modules by their
 * object file names, which carry a host-dependent hash
 * (rust-lang/rust#165736). CI and the release build on Linux x86_64, so
 * `--linux-x64` runs the same build in a Linux x86_64 container: that is how to
 * reproduce a published wasm from macOS, Windows or an arm64 machine.
 *
 * CI and local builds both run this through `bun run build:wasm`, so the flags
 * have one source.
 *
 * Usage:
 *   bun run scripts/build-wasm.ts               # build on this machine
 *   bun run scripts/build-wasm.ts --linux-x64   # build in Docker as CI does
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = 'wasm32-wasip1'
const ARTIFACT = 'meonode_swc_plugin.wasm'
const CARGO_BUILD_ARGS = ['build', '--release', '-p', 'meonode-swc-plugin', '--target', TARGET]

/** Separates flags in `CARGO_ENCODED_RUSTFLAGS`, which allows spaces inside a flag. */
const FLAG_SEPARATOR = '\x1f'

/** The platform CI and the release build on, which a published wasm is reproduced on. */
const CONTAINER_PLATFORM = 'linux/amd64'
/** Where the workspace is mounted in the container. */
const CONTAINER_WORKSPACE = '/src'
/** The cargo home of the official `rust` images. */
const CONTAINER_CARGO_HOME = '/usr/local/cargo'
/**
 * The container's target directory, inside the workspace's own so its output
 * reaches the host, but apart from it: the build scripts and proc macros built
 * there are Linux binaries, and would clash with the host's.
 */
const CONTAINER_TARGET_SUBDIR = join('target', 'linux-x64')

/**
 * Runs a command in the repository root and returns its stdout.
 * @param command The program.
 * @param args Its arguments.
 * @returns What it printed to stdout.
 * @throws When it cannot start or exits non-zero.
 */
function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  return result.stdout
}

/**
 * Runs a command in the repository root with its output shown, and exits with
 * its status when it fails.
 * @param command The program.
 * @param args Its arguments.
 * @param env The environment, when it differs from this process's.
 */
function runOrExit(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, env, stdio: 'inherit' })
  if (result.error && command === 'docker' && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    console.error('build:wasm:linux-x64 needs Docker (docker was not found on PATH)')
    process.exit(1)
  }
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

/**
 * The rustflags for the build, as `CARGO_ENCODED_RUSTFLAGS`: any the caller set,
 * then one remap per machine-specific prefix.
 * @param paths Where the workspace, target directory and cargo home are on the machine that builds.
 * @returns The flags, joined with {@link FLAG_SEPARATOR}.
 */
function encodedRustflags(paths: { workspace: string; target: string; cargoHome: string }): string {
  const inherited = process.env.CARGO_ENCODED_RUSTFLAGS
    ? process.env.CARGO_ENCODED_RUSTFLAGS.split(FLAG_SEPARATOR)
    : (process.env.RUSTFLAGS ?? '').split(' ').filter(Boolean)
  // rustc applies the last mapping that matches, so the most specific prefix goes last:
  // a cargo home or target directory inside the workspace is remapped as itself.
  const remaps: [from: string, to: string][] = [
    [paths.workspace, '.'],
    [paths.target, '/target'],
    [paths.cargoHome, '/cargo'],
  ]
  return [...inherited, ...remaps.map(([from, to]) => `--remap-path-prefix=${from}=${to}`)].join(FLAG_SEPARATOR)
}

/**
 * The exact Rust version rust-toolchain.toml pins, which names the container image.
 * @returns The `channel` value.
 * @throws When the file has no `channel`.
 */
function pinnedChannel(): string {
  const toml = readFileSync(join(REPO_ROOT, 'rust-toolchain.toml'), 'utf8')
  const channel = /^channel\s*=\s*"([^"]+)"/m.exec(toml)?.[1]
  if (!channel) throw new Error('rust-toolchain.toml has no channel')
  return channel
}

const metadata = JSON.parse(run('cargo', ['metadata', '--format-version', '1', '--no-deps'])) as {
  workspace_root: string
  target_directory: string
}

let builtWasm: string
if (process.argv.includes('--linux-x64')) {
  const targetDir = join(CONTAINER_WORKSPACE, CONTAINER_TARGET_SUBDIR)
  const rustflags = encodedRustflags({
    workspace: CONTAINER_WORKSPACE,
    target: targetDir,
    cargoHome: CONTAINER_CARGO_HOME,
  })
  runOrExit('docker', [
    'run',
    '--rm',
    '--platform',
    CONTAINER_PLATFORM,
    '--volume',
    `${metadata.workspace_root}:${CONTAINER_WORKSPACE}`,
    '--workdir',
    CONTAINER_WORKSPACE,
    '--env',
    `CARGO_TARGET_DIR=${targetDir}`,
    '--env',
    `CARGO_ENCODED_RUSTFLAGS=${rustflags}`,
    `rust:${pinnedChannel()}`,
    'cargo',
    ...CARGO_BUILD_ARGS,
  ])
  builtWasm = join(metadata.workspace_root, CONTAINER_TARGET_SUBDIR, TARGET, 'release', ARTIFACT)
} else {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CARGO_ENCODED_RUSTFLAGS: encodedRustflags({
      workspace: metadata.workspace_root,
      target: metadata.target_directory,
      cargoHome: process.env.CARGO_HOME ?? join(homedir(), '.cargo'),
    }),
  }
  delete env.RUSTFLAGS
  runOrExit('cargo', CARGO_BUILD_ARGS, env)
  builtWasm = join(metadata.target_directory, TARGET, 'release', ARTIFACT)
}

copyFileSync(builtWasm, join(REPO_ROOT, 'npm', ARTIFACT))
