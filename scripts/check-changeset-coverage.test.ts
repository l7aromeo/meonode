// Runs scripts/check-changeset-coverage.ts against throwaway git repositories:
// one package, committed on `main`, then one change on a branch.
import { afterEach, describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(import.meta.dir, 'check-changeset-coverage.ts')

const MANIFEST = {
  name: '@t/pkg',
  version: '1.0.0',
  main: './dist/index.js',
  files: ['dist', 'README.md'],
  scripts: { build: 'tsc' },
  peerDependencies: { react: '>=19.0.0' },
  devDependencies: { typescript: '6.0.0' },
}

const repos: string[] = []
afterEach(() => {
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function write(dir: string, file: string, content: string) {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  writeFileSync(path.join(dir, file), content)
}

function git(dir: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
}

/** A repository with the package committed on `main`, checked out on a branch. */
function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'changeset-check-'))
  repos.push(dir)
  write(dir, 'package.json', JSON.stringify({ name: 'root', private: true, workspaces: ['packages/*'] }))
  write(dir, '.changeset/config.json', JSON.stringify({ baseBranch: 'main' }))
  write(dir, '.changeset/published-sources.json', JSON.stringify({ '@t/pkg': ['packages/pkg/src/'] }))
  write(dir, 'packages/pkg/package.json', JSON.stringify(MANIFEST, null, 2))
  write(dir, 'packages/pkg/README.md', '# pkg\n')
  write(dir, 'packages/pkg/src/index.ts', 'export const a = 1\n')
  write(dir, 'packages/pkg/tests/index.test.ts', 'test\n')
  // @manypkg/get-packages picks the package manager, and so finds the workspaces, by
  // which lockfile exists; without one it sees the root package alone.
  write(dir, 'bun.lock', '{}\n')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'test')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  git(dir, 'switch', '-q', '-c', 'change')
  return dir
}

function editManifest(dir: string, edit: (m: Record<string, any>) => void) {
  const m = structuredClone(MANIFEST) as Record<string, any>
  edit(m)
  write(dir, 'packages/pkg/package.json', JSON.stringify(m, null, 2))
}

function check(dir: string) {
  const result = spawnSync('bun', [SCRIPT, 'main'], { cwd: dir, encoding: 'utf8' })
  return { status: result.status, output: result.stdout + result.stderr }
}

describe('needs no changeset', () => {
  it('when only devDependencies change', () => {
    const dir = repo()
    editManifest(dir, m => (m.devDependencies.typescript = '7.0.0'))
    expect(check(dir)).toMatchObject({ status: 0 })
  })

  it('when only a build script changes', () => {
    const dir = repo()
    editManifest(dir, m => (m.scripts.build = 'tsc -p tsconfig.build.json'))
    expect(check(dir)).toMatchObject({ status: 0 })
  })

  it('when only a test file changes', () => {
    const dir = repo()
    write(dir, 'packages/pkg/tests/index.test.ts', 'test changed\n')
    expect(check(dir)).toMatchObject({ status: 0 })
  })
})

describe('needs a changeset', () => {
  it('when a source the build publishes changes', () => {
    const dir = repo()
    write(dir, 'packages/pkg/src/index.ts', 'export const a = 2\n')
    const { status, output } = check(dir)
    expect(status).toBe(1)
    expect(output).toContain('packages/pkg/src/index.ts')
  })

  it('when a peer range changes', () => {
    const dir = repo()
    editManifest(dir, m => (m.peerDependencies.react = '>=19.3.0'))
    const { status, output } = check(dir)
    expect(status).toBe(1)
    expect(output).toContain('package.json peerDependencies')
  })

  it('when the files field changes', () => {
    const dir = repo()
    editManifest(dir, m => m.files.push('docs'))
    const { status, output } = check(dir)
    expect(status).toBe(1)
    expect(output).toContain('package.json files')
  })

  it('when a published file is deleted', () => {
    const dir = repo()
    unlinkSync(path.join(dir, 'packages/pkg/README.md'))
    const { status, output } = check(dir)
    expect(status).toBe(1)
    expect(output).toContain('packages/pkg/README.md')
  })

  it('and is satisfied by a changeset naming the package', () => {
    const dir = repo()
    write(dir, 'packages/pkg/src/index.ts', 'export const a = 2\n')
    write(dir, '.changeset/some-change.md', "---\n'@t/pkg': patch\n---\n\nChange a.\n")
    expect(check(dir)).toMatchObject({ status: 0 })
  })
})
