// @vitest-environment node
//
// Compiled nodes that carry their whole style's name, rendered on the server
// with no document, then loaded into one and hydrated, against the same tree
// with every node's css on the runtime path. Emotion's cache adopts the server's
// styles by the names they list and moves them out of the body before React
// hydrates, so both must hydrate without a mismatch, keep their `useId` ids,
// and leave the head with the same rules in the same order.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { builtinEnvironments } from 'vitest/runtime'

type Css = Record<string, unknown>
type Main = typeof import('@src/main.js')
type Style = (css: Css, isStatic?: boolean) => Record<string, unknown>
/** A case's tree, built from whichever load of the package renders it. */
type Tree = (ui: Main, react: typeof import('react'), style: Style) => import('@src/main.js').NodeInstance

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }

const CASES: Record<string, Tree> = {
  'statics and runtimes interleaved, with an id below them': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      children: [
        ui.Div({ key: 1, ...style({ order: 1 }) }),
        ui.Div({ key: 2, ...style({ order: 2 }, false) }),
        ui.Div({ key: 3, ...style({ order: 3 }), children: ui.Node(Id) }),
        ui.Div({ key: 4, ...style({ order: 4 }, false), children: ui.Div(style({ order: 5 })) }),
        ui.Div({ key: 6, ...style({ order: 6 }) }),
      ],
    })
  },
  'a static parent’s & > * against a runtime child': (ui, _, style) => ui.Div({ ...style({ '& > *': RED }), children: ui.Span('c', style(BLUE, false)) }),
  'a runtime parent’s & > * against a static child': (ui, _, style) => ui.Div({ ...style({ '& > *': RED }, false), children: ui.Span('c', style(BLUE)) }),
}

/** Loads the package afresh, so it reads whether a document exists as it loads. */
async function load() {
  vi.resetModules()
  const [ui, react, registry, theme, names, serialize, emotion, createCache] = await Promise.all([
    import('@src/main.js'),
    import('react'),
    import('@src/util/static-css.util.js'),
    import('@src/util/theme.util.js'),
    import('@src/util/style-name.util.js'),
    import('@emotion/serialize'),
    import('@emotion/react'),
    import('@emotion/cache').then(module => module.default),
  ])
  const compile = (css: Css) => {
    const resolved = theme.ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
    return names.nameStyles(serialize.serializeStyles([theme.ThemeUtil.resolveDefaultStyle(theme.ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  }
  const styles =
    (compiled: boolean): Style =>
    (css, isStatic = true) => {
      if (!compiled || !isStatic) return { css }
      const { name, styles: text } = compile(css)
      registry.registerStaticCss(`m-${name}`, [[name, text]])
      return { __meo$: 2, __meo$n: name }
    }
  /** The case's page, under a cache of its own when `provider` is set, as an app with a registry renders it. */
  const page = (tree: Tree, compiled: boolean, provider: boolean) => {
    const element = tree(ui, react, styles(compiled)).render() as import('react').ReactElement
    return provider ? react.createElement(emotion.CacheProvider, { value: createCache({ key: 'css' }) }, element) : element
  }
  return { react, page }
}

/** Renders `tree` on the server, hydrates it in a document, and reads what came of it. */
async function serverThenHydrate(tree: Tree, compiled: boolean, provider: boolean) {
  const server = await load()
  const { renderToString } = await import('react-dom/server')
  const html = renderToString(server.page(tree, compiled, provider))

  // The page loads in a document of its own, with the globals a jsdom suite has.
  const browser = await builtinEnvironments.jsdom.setup(globalThis, {
    jsdom: { html: `<!doctype html><html><head></head><body><div id="root">${html}</div></body></html>` },
  })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  try {
    const client = await load()
    const errors: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args.map(String).join(' ')))
    const { hydrateRoot } = await import('react-dom/client')
    const { act } = client.react
    const container = document.getElementById('root')!
    const ids = () => [...container.querySelectorAll('[data-id]')].map(element => element.getAttribute('data-id'))
    /** The rules of the page's style elements, in document order, each the first time it appears. */
    const rules = () => [
      ...new Set(
        [...document.querySelectorAll<HTMLStyleElement>('style[data-emotion]')].flatMap(element =>
          [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
        ),
      ),
    ]
    const element = client.page(tree, compiled, provider)
    // What the browser paints before any script runs: Emotion's cache has
    // moved the server's styles into the head by now, as it does on load.
    const firstPaint = rules()
    const before = ids()
    await act(async () => void hydrateRoot(container, element))
    error.mockRestore()
    return {
      errors,
      ids: before.length,
      idsKept: JSON.stringify(ids()) === JSON.stringify(before),
      firstPaint,
      rules: rules(),
      stylesLeftInBody: container.querySelectorAll('style').length,
      // The ids themselves differ between the two: the compiled tree has fewer fibers.
      markup: container.innerHTML.replaceAll(/ data-id="[^"]*"/g, ''),
    }
  } finally {
    await browser.teardown(globalThis)
  }
}

afterAll(() => vi.resetModules())

describe.each([
  ['with no cache provider', false],
  ['under a cache provider', true],
])('a server-rendered page %s, with compiled nodes, hydrates as its runtime twin does', (_, provider) => {
  it.each(Object.entries(CASES))('%s', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ errors: [], idsKept: true, stylesLeftInBody: 0 })
    expect(expected.firstPaint.length).toBeGreaterThan(0)
    expect(expected.firstPaint).toEqual(expected.rules)
    expect(await serverThenHydrate(tree, true, provider)).toEqual(expected)
  })
})
