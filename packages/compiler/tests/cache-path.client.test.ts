// @vitest-environment jsdom
//
// Regression test for the stable-key hazard fixed alongside v0.2's leading-
// spread support (Change 2). See `cache-path-spread.ts` and the doc comment
// on `partition::rewrite_object` (crate side) for the full mechanism.
//
// Unlike `equivalence.test.ts`/`equivalence.client.test.ts` (which each
// render a fixture's tree exactly ONCE and compare original-vs-compiled),
// this test renders the SAME compiled call site TWICE, with different
// spread contents, into the SAME React root. The bug was about what a
// *second* evaluation returns, not whether the first is correct, so a
// single-render suite structurally cannot catch it.
//
// The hazard itself is gone as of `@meonode/ui@2.0.0-beta.0`, which moved
// memoized subtrees into fibers and removed the derived-key element cache
// they could collide in. The plugin still withholds `k` on spread-bearing
// call sites — a compiled bundle has to stay correct on `1.x` too — so this
// keeps asserting both halves: that the marker is emitted without `k`, and
// that a second render reflects the new spread contents.
//
// Memoization only ever engaged on the client, so this must run under
// `@vitest-environment jsdom` (where `window` is defined), not the
// `renderToString` SSR path the other equivalence suites use.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import createEmotionCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { transform } from '@swc/core'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it } from 'vitest'

const WASM_PATH = path.resolve(import.meta.dirname, '../npm/meonode_swc_plugin.wasm')
const FIXTURES_DIR = path.resolve(import.meta.dirname, 'equivalence-fixtures')
const TMP_DIR = path.resolve(import.meta.dirname, '.tmp')

if (!existsSync(WASM_PATH)) {
  throw new Error(`wasm artifact not found at ${WASM_PATH} — run \`bun run build:wasm\` first`)
}

async function compileWithPlugin(src: string, filename: string): Promise<string> {
  const result = await transform(src, {
    filename,
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript', tsx: false },
      experimental: {
        plugins: [[WASM_PATH, {}]],
      },
    },
  })
  return result.code
}

interface RenderableNode {
  render(): Parameters<typeof createElement>[2] extends never ? never : ReturnType<typeof createElement>
}

type MakeRow = (extra: Record<string, unknown>) => RenderableNode

async function loadFixture(code: string, cacheBust: string): Promise<{ makeRow: MakeRow; makeTrackedRow: MakeRow }> {
  const file = path.join(TMP_DIR, `cache-path-spread.compiled.${cacheBust}.mjs`)
  await writeFile(file, code, 'utf8')
  return (await import(pathToFileURL(file).href)) as { makeRow: MakeRow; makeTrackedRow: MakeRow }
}

/**
 * Renders one fixture export twice into the same root with different spread
 * contents, and returns the HTML after each render.
 * @param make The compiled fixture export to invoke.
 * @returns The container HTML after the first and second renders.
 */
async function renderTwice(make: MakeRow): Promise<{ first: string; second: string }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cache = createEmotionCache({ key: 'css' })
  const root = createRoot(container)

  await act(async () => {
    root.render(createElement(CacheProvider, { value: cache }, make({ id: 'row-red' }).render()))
  })
  const first = container.innerHTML

  await act(async () => {
    root.render(createElement(CacheProvider, { value: cache }, make({ id: 'row-blue' }).render()))
  })
  const second = container.innerHTML

  act(() => {
    root.unmount()
  })
  container.remove()
  return { first, second }
}

beforeAll(async () => {
  await mkdir(TMP_DIR, { recursive: true })
})

describe('leading spread + deps array', () => {
  it('withholds the call-site key, and honours deps literally', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'cache-path-spread.ts')
    const src = await readFile(fixturePath, 'utf8')
    const compiledCode = await compileWithPlugin(src, 'cache-path-spread.ts')

    // Sanity: this call site must actually be compiled, or the assertions
    // below would pass vacuously against an untouched call site.
    expect(compiledCode).toContain('__meo$')
    // `k` must be absent, because a spread is present. Nothing reads it on a
    // current runtime, but a compiled bundle still has to be correct on `1.x`,
    // where an emitted `k` was exactly what made two evaluations of this call
    // site collide.
    expect(compiledCode).not.toMatch(/\bk:\s*"m/)

    const { makeRow, makeTrackedRow } = await loadFixture(compiledCode, 'run')

    // `deps: []` says never rebuild, and that is now taken at its word — the
    // element is memoized by `useMemo`, which does not care that a prop
    // changed. `1.x` rebuilt here instead, because a changed prop changed the
    // derived cache key, which quietly meant `deps: []` never really held.
    const frozen = await renderTwice(makeRow)
    expect(frozen.first).toContain('id="row-red"')
    expect(frozen.second).toContain('id="row-red"')
    expect(frozen.second).not.toContain('id="row-blue"')

    // Declaring the spread's contents as a dependency is what makes the row
    // follow them — the same thing React requires of any `useMemo`.
    const tracked = await renderTwice(makeTrackedRow)
    expect(tracked.first).toContain('id="row-red"')
    expect(tracked.second).toContain('id="row-blue"')
    expect(tracked.second).not.toContain('id="row-red"')
  })
})
