// @vitest-environment node
//
// The server side of theme-token-rewrite-cache.test.ts. On the server the module
// lives for the whole process, so the rewritten strings it keeps must stop growing
// across requests: the same page served again adds nothing, and pages whose
// strings differ on every request stay at the cap. Compiled, these call sites
// arrive with their tokens rewritten and keep nothing; the cases check that instead.
import { renderToString } from 'react-dom/server'
import { Div, Node, ThemeProvider } from '@src/main.js'
import { cachedThemeRewrites, setThemeRewriteCacheCap } from '@src/util/server-theme.util.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'
import type { ReactNode } from 'react'

/** The cap the module ships with, per kind of context. */
const SHIPPED_CAP = 512
/** Kinds of context, each with a cache of its own. */
const CACHES = 3
const REQUESTS = 300
/** Whether call sites reach the runtime rewrite, which a compiled build does not. */
const RUNTIME = process.env.MEONODE_COMPILED !== '1'

afterEach(() => setThemeRewriteCacheCap(SHIPPED_CAP))

const len = (path: string) => `var(--meonode-theme-${path}--len, var(--meonode-theme-${path}))`

const Content = ({ make }: { make: () => { render: () => ReactNode } }) => make().render()

/** One request: a fresh render of the page, then a turn of the event loop, as between requests. */
const serve = async (make: () => { render: () => ReactNode }) => {
  const html = renderToString(
    ThemeProvider({ tokens: { spacing: { md: 16, sm: 4 } }, modes: ['light'], defaultMode: 'light', children: Node(Content, { make }) }).render(),
  )
  await new Promise(resolve => setTimeout(resolve, 0))
  return html
}

it('holds the same strings after the last of many requests for one page as after the first', async () => {
  setThemeRewriteCacheCap(SHIPPED_CAP)
  const make = () =>
    Div({ padding: 'theme.spacing.md', margin: 'theme.spacing.sm theme.spacing.md', css: { '& > span': 'padding: theme.spacing.sm;' }, children: 'x' })
  const sizes: number[] = []
  for (let request = 0; request < REQUESTS; request++) {
    expect(await serve(make)).toContain(`padding:${len('spacing-md')}`)
    sizes.push(cachedThemeRewrites().kept)
  }
  // Kept on the second request, and the same from then on.
  expect(sizes[1] > 0).toBe(RUNTIME)
  expect(new Set(sizes.slice(1))).toEqual(new Set([sizes[1]]))
})

it('stays at its cap when every request writes new strings, and keeps the ones every request writes', async () => {
  // A small cap, so a few requests of ten new strings each pass it with little work.
  const cap = 4
  setThemeRewriteCacheCap(cap)
  let peakSeen = 0
  const kept: number[] = []
  for (let request = 0; request < 5; request++) {
    const make = () =>
      Div({
        children: Array.from({ length: 10 }, (_, i) =>
          Div({ key: i, padding: `calc(${request * 10 + i}px + theme.spacing.md)`, margin: 'theme.spacing.sm', children: `x${i}` }),
        ),
      })
    expect(await serve(make)).toContain(`padding:calc(${request * 10 + 9}px + ${len('spacing-md')})`)
    const counts = cachedThemeRewrites()
    peakSeen = Math.max(peakSeen, counts.seen)
    kept.push(counts.kept)
  }
  // 50 distinct strings went through caches capped at 4, compiled or not, as the
  // compiler leaves a template literal's tokens to the runtime. At most the
  // literal every request writes was kept.
  expect(peakSeen).toBe(cap)
  expect(peakSeen).toBeLessThanOrEqual(CACHES * cap)
  expect(new Set(kept.slice(1)).size).toBe(1)
  expect(kept.at(-1)).toBeLessThanOrEqual(1)
  if (RUNTIME) expect(kept.at(-1)).toBe(1)
})

describe('development reports', () => {
  /** Every warning one server render of a token no provider defines, and one no provider is above, prints. */
  const reports = async () => {
    __resetThemeDiagnostics()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await serve(() => Div({ color: 'theme.colors.missing', padding: 'theme.spacing.md', children: 'x' }))
    renderToString(Div({ margin: 'theme.spacing.sm', children: 'y' }).render())
    const printed = warn.mock.calls.map(call => String(call[0]))
    warn.mockRestore()
    return printed
  }

  afterEach(() => __resetThemeDiagnostics())

  it('reports on a render whose strings are all cache hits as on the first, and as with no cache', async () => {
    setThemeRewriteCacheCap(0)
    const uncached = await reports()
    expect(uncached.some(m => m.includes('theme.colors.missing') && m.includes('is not defined by the active theme'))).toBe(true)
    expect(uncached.some(m => m.includes('theme.spacing.sm') && m.includes('no ThemeProvider'))).toBe(true)

    setThemeRewriteCacheCap(SHIPPED_CAP)
    expect(await reports()).toEqual(uncached)
    expect(await reports()).toEqual(uncached)
    const before = cachedThemeRewrites()
    expect(before.kept > 0).toBe(RUNTIME)
    // Every string is kept now, so this render reads only hits.
    expect(await reports()).toEqual(uncached)
    expect(cachedThemeRewrites()).toEqual(before)
  })
})
