// Under the compiled config, a run made after the compiler's wasm changes
// compiles with the wasm it loads. It never replays a transform that an
// earlier build made, which a module cache keyed by source and config alone
// would do.
//
// Two builds that compile differently are made from the one at hand: a copy
// with the list marker's name changed to another of the same length.
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createVitest } from 'vitest/node'
import type { Plugin } from 'vite'

const uiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const FIXTURE = 'tests/compiled-config/fixtures/list-site.ts'
const MARKER = '__meo$list'
/** The marker's name in the second build: as long as {@link MARKER}, so the wasm stays valid. */
const RENAMED = '__meo$tsil'
/** Two nested Vitest runs, each loading the config and compiling one file. */
const TIMEOUT_MS = 120_000

let dir: string
let builds: { original: string; renamed: string }

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'meonode-stale-transform-'))
  const source = path.resolve(uiDir, '../compiler/npm/meonode_swc_plugin.wasm')
  const original = path.join(dir, 'original.wasm')
  copyFileSync(source, original)
  const bytes = readFileSync(original)
  const at = bytes.indexOf(MARKER)
  if (at < 0 || bytes.indexOf(MARKER, at + 1) >= 0) throw new Error(`expected ${MARKER} once in the wasm`)
  bytes.write(RENAMED, at, 'latin1')
  const renamed = path.join(dir, 'renamed.wasm')
  writeFileSync(renamed, bytes)
  builds = { original, renamed }
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** The fixture as the compiled config transformed it in one run with `wasm`, or undefined if no transform ran. */
async function compiledFixture(wasm: string): Promise<string | undefined> {
  let code: string | undefined
  const seen: Plugin = {
    name: 'fixture-output',
    enforce: 'post',
    transform(source, id) {
      if (id.endsWith(FIXTURE)) code = source
    },
  }
  const previous = process.env.MEONODE_COMPILER_WASM
  process.env.MEONODE_COMPILER_WASM = wasm
  try {
    const vitest = await createVitest(
      'test',
      {
        config: path.join(uiDir, 'vitest.compiled.config.ts'),
        root: uiDir,
        include: [FIXTURE],
        watch: false,
        reporters: [],
        fsModuleCachePath: path.join(dir, 'cache'),
      },
      { plugins: [seen] },
    )
    try {
      await vitest.start([FIXTURE])
    } finally {
      await vitest.close()
    }
  } finally {
    if (previous === undefined) delete process.env.MEONODE_COMPILER_WASM
    else process.env.MEONODE_COMPILER_WASM = previous
  }
  return code
}

describe.runIf(process.env.MEONODE_COMPILED === '1')('the compiled config after the wasm changes', () => {
  it('compiles with the wasm it loads', { timeout: TIMEOUT_MS }, async () => {
    const first = await compiledFixture(builds.original)
    expect(first).toContain(MARKER)
    const second = await compiledFixture(builds.renamed)
    expect(second, 'the second run transformed nothing: it replayed the first run').toBeDefined()
    expect(second).toContain(RENAMED)
    expect(second).not.toContain(MARKER)
  })
})
