// What @meonode/mui's manifest promises about the packages it wraps.
import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const PACKAGE_DIR = path.join(import.meta.dir, '../packages/mui')

const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
  peerDependencies: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  exports: Record<string, Record<string, string>>
}

/** The peers every import path needs: the package's core imports @mui/material. */
const REQUIRED = new Set(['@meonode/ui', '@mui/material', 'react'])

/** The wrapper directory the package root (`.`) exports, through `main`. */
const ROOT_LIB = 'mui.core'

// A required peer is installed by npm 7+ and bun whether or not the project imports its
// path, so every other wrapped package has to stay an optional peer.
describe('@meonode/mui peer dependencies', () => {
  it('are optional except for the ones every import path needs', () => {
    const required = Object.keys(manifest.peerDependencies).filter(name => !manifest.peerDependenciesMeta?.[name]?.optional)
    expect(required.sort()).toEqual([...REQUIRED].sort())
  })

  it('mark only real peers as optional', () => {
    const notPeers = Object.keys(manifest.peerDependenciesMeta ?? {}).filter(name => !(name in manifest.peerDependencies))
    expect(notPeers).toEqual([])
  })
})

// Each generated wrapper directory is built, so without an `exports` entry it ships in
// the tarball and no import can reach it.
describe('@meonode/mui exports', () => {
  const libs = readdirSync(path.join(PACKAGE_DIR, 'src/lib'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== ROOT_LIB)
    .map(entry => entry.name)

  it.each(libs)('has a subpath for src/lib/%s', lib => {
    expect(manifest.exports[`./${lib.replace(/^mui\./, '')}`]).toEqual({
      import: `./dist/esm/lib/${lib}/index.js`,
      require: `./dist/cjs/lib/${lib}/index.cjs`,
      types: `./dist/types/lib/${lib}/index.d.ts`,
    })
  })
})
