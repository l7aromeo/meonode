#!/usr/bin/env bun
/**
 * Packs each TypeScript package and checks what a consumer resolves from the
 * tarball: every entry field and export condition must name a file the package
 * ships, and every entry point must resolve to declarations of the right
 * module format under `node10`, `node16` (from CommonJS and from ESM) and
 * `bundler` resolution.
 *
 * Two tools, because each catches what the other does not:
 * - `@arethetypeswrong/cli` resolves every entry point the way TypeScript does
 *   in each mode, and fails on a missing resolution, a condition reached only by
 *   fallback, ESM declarations for CommonJS code, or an import inside the
 *   declarations that does not resolve.
 * - `publint --strict` reads the manifest itself: entry fields pointing at
 *   missing files, condition order, and format mismatches, warnings included.
 *
 * The packages must be built first (`bun run build:ui && bun run build:mui`).
 *
 * Usage:
 *   bun run scripts/check-package-entries.ts [package-dir...]   # default: packages/ui packages/mui
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '..')
const DEFAULT_PACKAGES = ['packages/ui', 'packages/mui']

/**
 * The tools' own binaries, from the root devDependencies. Never `bunx <name>`:
 * without a local install it downloads whatever npm holds under that name, and
 * the package `attw` is a placeholder that prints a notice and exits 0, so the
 * check would pass having checked nothing.
 */
const bin = (name: string): string => {
  const file = path.join(ROOT, 'node_modules', '.bin', name)
  if (!existsSync(file)) throw new Error(`${name} is not installed; run bun install at the repository root`)
  return file
}
const ATTW = bin('attw')
const PUBLINT = bin('publint')

/** Runs a command, streaming its output. @returns Whether it exited 0. */
const run = (command: string, args: string[], cwd: string): boolean => spawnSync(command, args, { cwd, stdio: 'inherit' }).status === 0

const packages = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PACKAGES
const outDir = mkdtempSync(path.join(tmpdir(), 'package-entries-'))
const failed: string[] = []
try {
  for (const dir of packages) {
    const cwd = path.resolve(ROOT, dir)
    const before = new Set(readdirSync(outDir))
    if (!run('bun', ['pm', 'pack', '--quiet', '--destination', outDir], cwd)) {
      failed.push(`${dir}: pack`)
      continue
    }
    const tarball = readdirSync(outDir).find(f => !before.has(f))
    if (!tarball) throw new Error(`bun pm pack wrote no tarball for ${dir}`)
    const file = path.join(outDir, tarball)
    console.log(`\n## ${dir} (${tarball})`)
    if (!run(ATTW, [file], ROOT)) failed.push(`${dir}: attw`)
    if (!run(PUBLINT, [file, '--strict'], ROOT)) failed.push(`${dir}: publint`)
  }
} finally {
  rmSync(outDir, { recursive: true, force: true })
}

if (failed.length) {
  console.error(`\ncheck-package-entries failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log('\ncheck-package-entries: all packages pass')
