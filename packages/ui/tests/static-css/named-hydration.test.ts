// @vitest-environment node
//
// Compiled nodes that carry their whole style's name, rendered on the server
// with no document, then loaded into one and hydrated, against the same tree
// with every node's css on the runtime path. Emotion's cache adopts the server's
// styles by the names they list and moves them out of the body before React
// hydrates, so both must hydrate without a mismatch, keep their `useId` ids,
// and leave the head with the same rules in the same order. It runs with no
// `act`, so React's production build runs it too.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { builtinEnvironments } from 'vitest/runtime'

type Css = Record<string, unknown>
type Main = typeof import('@src/main.js')
/** Props giving a node `css`, and with `slots` the positions the compiler marks among a host's children. */
type Style = ((css: Css, isStatic?: boolean) => Record<string, unknown>) & {
  slots: (...paths: (number | number[])[]) => Record<string, unknown>
  /** A static node the compiler marked to carry the named styles after it. */
  carrier: (css: Css) => Record<string, unknown>
}

/**
 * The cache a page renders under: Emotion's default, one of its own, or one
 * that prepends, with the page's own stylesheet first in the head.
 */
type Provider = 'none' | 'cache' | 'prepend'

/** The page's own stylesheet, which a prepending cache's rules go ahead of. */
const PAGE_STYLESHEET = '<style data-page>.card{padding:0}</style>'

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
  'a parent and child written twice, the parent’s & > * against the child’s own colour': (ui, _, style) => {
    const pair = (key: number) => ui.Div({ key, ...style({ '& > *': RED }), children: ui.Span('c', style(BLUE, false)) })
    return ui.Div({ children: [pair(1), pair(2)] })
  },
  'a static parent and child written twice, in one run before a runtime node': (ui, _, style) => {
    const pair = (key: number) => ui.Div({ key, ...style({ '& > *': RED }), children: ui.Span('c', style(BLUE)) })
    return ui.Div({ children: [pair(1), pair(2), ui.Div({ key: 3, ...style({ order: 3 }, false) })] })
  },
  'cards whose rules are all compiled, the page’s own rule for the class beside them': (ui, _, style) =>
    ui.Div({
      children: [ui.Div({ key: 1, className: 'card', ...style.carrier({ padding: 16 }) }), ui.Div({ key: 2, className: 'card', ...style({ padding: 12 }) })],
    }),
  'a static parent’s & > * against a runtime child': (ui, _, style) => ui.Div({ ...style({ '& > *': RED }), children: ui.Span('c', style(BLUE, false)) }),
  'a runtime parent’s & > * against a static child': (ui, _, style) => ui.Div({ ...style({ '& > *': RED }, false), children: ui.Span('c', style(BLUE)) }),
}

/**
 * Cases that mark no carrier: the walk carries each run at the first named node
 * of its stretch, as the compiler marks one, on the server and in the browser
 * alike. The carried cases below are the same trees as the compiler marks them.
 */
const UNMARKED_CASES: Record<string, Tree> = {
  'statics before components with ids, at marked positions': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId(), ...style({ order: 9 }) }).render() as import('react').ReactElement
    return ui.Div({
      ...style.slots(1, [2, 1], 3),
      children: [
        ui.Div({ key: 1, ...style({ order: 1 }) }),
        ui.Node(Id),
        [ui.Span('a', { key: 'a', ...style({ order: 2 }) }), ui.Node(Id, { key: 'b' })],
        ui.Node(Id),
      ],
    })
  },
  'a static parent and child written twice, at the end of their carrier': (ui, _, style) => {
    const pair = (key: number) => ui.Div({ key, ...style({ '& > *': RED }), children: ui.Span('c', style(BLUE)) })
    return ui.Div({ children: [pair(1), pair(2)] })
  },
  // The browser renders a memoized node in a walk of its own, the server in the
  // page's: both carry at the same nodes, so the ids after it are kept.
  'statics around a memoized node, with an id after it': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      children: [
        ui.Span('s', { key: 's', ...style({ order: 1 }) }),
        ui.Div({ key: 'm', ...style({ order: 2 }), children: ui.Span('in', style({ order: 3 })) }, []),
        ui.Span('t', { key: 't', ...style({ order: 4 }) }),
        ui.Node(Id, { key: 'i' }),
      ],
    })
  },
  'statics around a hidden and a visible Activity, with an id after them': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      children: [
        ui.Span('s', { key: 's', ...style({ order: 1 }) }),
        ui.Activity({ key: 'h', mode: 'hidden', children: ui.Span('in', style({ order: 2 })) }),
        ui.Activity({ key: 'v', mode: 'visible', children: ui.Span('in', style({ order: 3 })) }),
        ui.Span('t', { key: 't', ...style({ order: 4 }) }),
        ui.Node(Id, { key: 'i' }),
      ],
    })
  },
}

/** Cases with carriers in place of slots and the trailing leaf: the host and the first named node after each component. */
const CARRIER_CASES: Record<string, Tree> = {
  // In development a named node's theme tokens are checked with nothing added
  // to the render, so the ids below it are the runtime twin's.
  'a named node reading a theme token, before a component with an id': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId(), ...style.carrier(BLUE) }).render() as import('react').ReactElement
    return ui.Div({
      ...style.carrier({ display: 'grid' }),
      ...style.slots(1),
      children: [ui.Span('t', { key: 't', ...style({ color: 'var(--meonode-theme-primary-missing)' }) }), ui.Node(Id, { key: 'i' })],
    })
  },
  'statics before components with ids, carried': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId(), ...style.carrier({ order: 9 }) }).render() as import('react').ReactElement
    return ui.Div({
      ...style.carrier({ display: 'grid' }),
      ...style.slots(1, [2, 1], 3),
      children: [
        ui.Div({ key: 1, ...style({ order: 1 }) }),
        ui.Node(Id),
        [ui.Span('a', { key: 'a', ...style.carrier({ order: 2 }) }), ui.Node(Id, { key: 'b' })],
        ui.Node(Id),
      ],
    })
  },
  'a static parent and child written twice, at the end, carried by the host': (ui, _, style) => {
    const pair = (key: number) => ui.Div({ key, ...style({ '& > *': RED }), children: ui.Span('c', style(BLUE)) })
    return ui.Div({ ...style.carrier({ display: 'grid' }), children: [pair(1), pair(2)] })
  },
  'statics after a runtime node, before a component with an id': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId(), ...style.carrier(BLUE) }).render() as import('react').ReactElement
    return ui.Div({
      ...style.slots(2),
      children: [ui.Div({ key: 1, ...style({ order: 1 }, false) }), ui.Div({ key: 2, ...style({ order: 2 }) }), ui.Node(Id, { key: 3 })],
    })
  },
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
  const styles = (compiled: boolean): Style =>
    Object.assign(
      (css: Css, isStatic = true) => {
        if (!compiled || !isStatic) return { css }
        const { name, styles: text } = compile(css)
        registry.registerStaticCss(`m-${name}`, [[name, text]])
        return { __meo$: 2, __meo$n: name }
      },
      {
        slots: (...paths: (number | number[])[]) => (compiled ? { __meo$: 2, __meo$p: paths } : {}),
        carrier: (css: Css) => {
          if (!compiled) return { css }
          const { name, styles: text } = compile(css)
          registry.registerStaticCss(`m-${name}`, [[name, text]])
          return { __meo$: 2, __meo$n: name, __meo$r: 1 }
        },
      },
    )
  /** The case's page, under a cache of its own unless `provider` is `'none'`, as an app with a registry renders it. */
  const page = (tree: Tree, compiled: boolean, provider: Provider) => {
    // From a component, where an app's walk runs and reads its cache.
    const element = react.createElement(function Page() {
      return tree(ui, react, styles(compiled)).render() as import('react').ReactElement
    })
    if (provider === 'none') return element
    return react.createElement(emotion.CacheProvider, { value: createCache({ key: 'css', prepend: provider === 'prepend' }) }, element)
  }
  return { react, page }
}

/** How long React's scheduler gets to finish a hydration or an unmount: its tasks run on timers in a document with no frames. */
const HYDRATION_SETTLE_MS = 50

/** Renders `tree` on the server, hydrates it in a document, and reads what came of it. */
async function serverThenHydrate(tree: Tree, compiled: boolean, provider: Provider) {
  const server = await load()
  const { renderToString } = await import('react-dom/server')
  const html = renderToString(server.page(tree, compiled, provider))

  // The page loads in a document of its own, with the globals a jsdom suite has.
  const browser = await builtinEnvironments.jsdom.setup(globalThis, {
    jsdom: { html: `<!doctype html><html><head>${provider === 'prepend' ? PAGE_STYLESHEET : ''}</head><body><div id="root">${html}</div></body></html>` },
  })
  try {
    const client = await load()
    const errors: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args.map(String).join(' ')))
    const { hydrateRoot } = await import('react-dom/client')
    const container = document.getElementById('root')!
    const ids = () => [...container.querySelectorAll('[data-id]')].map(element => element.getAttribute('data-id'))
    // A rule written again counts again: the later copy is the one a tie goes to.
    /** The rules of the page's style elements, in document order. */
    const rules = () =>
      [...document.querySelectorAll<HTMLStyleElement>('style[data-emotion], style[data-page]')].flatMap(element =>
        element.hasAttribute('data-page') ? ['page'] : [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText),
      )
    const element = client.page(tree, compiled, provider)
    // What the browser paints before any script runs: Emotion's cache has
    // moved the server's styles into the head by now, as it does on load.
    const firstPaint = rules()
    const before = ids()
    // React's production build has no `act`: it reports a mismatch to
    // `onRecoverableError`, once its scheduler has run the hydration.
    const root = hydrateRoot(container, element, { onRecoverableError: reported => void errors.push(String(reported)) })
    await new Promise(resolve => setTimeout(resolve, HYDRATION_SETTLE_MS))
    error.mockRestore()
    const result = {
      errors,
      ids: before.length,
      idsKept: JSON.stringify(ids()) === JSON.stringify(before),
      firstPaint,
      rules: rules(),
      stylesLeftInBody: container.querySelectorAll('style').length,
      // The ids themselves differ between the two: the compiled tree has fewer fibers.
      markup: container.innerHTML.replaceAll(/ data-id="[^"]*"/g, ''),
    }
    root.unmount()
    // What the unmount scheduled runs here, while the document still exists.
    await new Promise(resolve => setTimeout(resolve, HYDRATION_SETTLE_MS))
    return result
  } finally {
    await browser.teardown(globalThis)
  }
}

afterAll(() => vi.resetModules())

describe.each([
  ['with no cache provider', 'none'],
  ['under a cache provider', 'cache'],
  ['under a cache that prepends, the page’s stylesheet first', 'prepend'],
] as const)('a server-rendered page %s, with compiled nodes, hydrates as its runtime twin does', (_, provider) => {
  it.each(Object.entries(CASES))('%s', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ errors: [], idsKept: true, stylesLeftInBody: 0 })
    expect(expected.firstPaint.length).toBeGreaterThan(0)
    expect(expected.firstPaint).toEqual(expected.rules)
    expect(await serverThenHydrate(tree, true, provider)).toEqual(expected)
  })
})

describe.each([
  ['with no cache provider', 'none'],
  ['under a cache provider', 'cache'],
  ['under a cache that prepends, the page’s stylesheet first', 'prepend'],
] as const)('a server-rendered page %s, with carriers, hydrates as its runtime twin does', (_, provider) => {
  it.each(Object.entries(CARRIER_CASES))('%s', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ errors: [], idsKept: true, stylesLeftInBody: 0 })
    expect(expected.firstPaint.length).toBeGreaterThan(0)
    expect(await serverThenHydrate(tree, true, provider)).toEqual(expected)
  })
})

describe.each([
  ['with no cache provider', 'none'],
  ['under a cache provider', 'cache'],
  ['under a cache that prepends, the page’s stylesheet first', 'prepend'],
] as const)('a server-rendered page %s, with no carrier marked, hydrates as its runtime twin does', (_, provider) => {
  it.each(Object.entries(UNMARKED_CASES))('%s', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ errors: [], idsKept: true, stylesLeftInBody: 0 })
    expect(await serverThenHydrate(tree, true, provider)).toEqual(expected)
  })
})
