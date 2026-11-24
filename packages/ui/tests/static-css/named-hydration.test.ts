// @vitest-environment node
//
// Compiled nodes that carry their whole style's name, rendered on the server
// with no document, then loaded into one and hydrated, against the same tree
// with every node's css on the runtime path. Emotion's cache adopts the server's
// styles by the names they list and moves them out of the body before React
// hydrates, so both must hydrate without a mismatch, keep their `useId` ids,
// and leave the head with the same rules in the same order. Pages whose styles
// need a sheet edge go out as several `<style>` elements, with no registry and
// under `StyleRegistry`; each must be adopted, none added. It runs with no
// `act`, so React's production build runs it too.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { builtinEnvironments } from 'vitest/runtime'

type Css = Record<string, unknown>
type Main = typeof import('@src/main.js')
/** Props giving a node `css`. */
type Style = ((css: Css, isStatic?: boolean) => Record<string, unknown>) & {
  /** A static node the compiler marked to carry the named styles after it. */
  carrier: (css: Css) => Record<string, unknown>
}

/**
 * The cache a page renders under: Emotion's default, one of its own, or, with
 * the page's own stylesheet first in the head, one that prepends, one that
 * appends, or one that inserts after an element of the page's.
 */
type Provider = 'none' | 'cache' | 'prepend' | 'append' | 'insertion-point'

/** The page's own stylesheet, which a prepending cache's rules go ahead of and an appending one's after. */
const PAGE_STYLESHEET = '<style data-page>.card{padding:0}</style>'

/** The element a cache with an insertion point puts its rules right after: ahead of the page's stylesheet. */
const INSERTION_POINT = '<meta name="emotion-insertion-point" content="">'

/** The head a provider's page loads with. */
const headOf = (provider: Provider) =>
  provider === 'insertion-point' ? `${INSERTION_POINT}${PAGE_STYLESHEET}` : provider === 'none' || provider === 'cache' ? '' : PAGE_STYLESHEET

/** Every provider, as each block of cases runs under them. */
const PROVIDERS = [
  ['with no cache provider', 'none'],
  ['under a cache provider', 'cache'],
  ['under a cache that prepends, the page’s stylesheet first', 'prepend'],
  ['under a cache that appends, the page’s stylesheet first', 'append'],
  ['under a cache with an insertion point ahead of the page’s stylesheet', 'insertion-point'],
] as const

/** A case's tree, built from whichever load of the package renders it. */
type Tree = (ui: Main, react: typeof import('react'), style: Style) => import('@src/main.js').NodeInstance

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }

/**
 * Pages whose named server styles need a sheet edge, so the server writes them
 * as several `<style>` elements where it writes one otherwise: a style whose
 * key leaves a `(` open, and a style that is an `@import` alone. Emotion's
 * development build drops a nested `@import` (with a console error), so that
 * page splits only in production.
 */
const SPLIT_CASES: Record<string, Tree> = {
  'a static node whose key leaves a `(` open, before statics and an id': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      children: [
        ui.Div({ key: 1, ...style({ padding: 2, '&:not(.a': RED }) }),
        ui.Div({ key: 2, ...style({ padding: 3 }) }),
        ui.Div({ key: 3, ...style({ padding: 4 }), children: ui.Node(Id) }),
      ],
    })
  },
  ...(process.env.NODE_ENV === 'production'
    ? {
        'a static node that is an `@import` alone, after a static, before an id': ((ui, react, style) => {
          const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
          return ui.Div({
            children: [
              ui.Div({ key: 1, ...style({ padding: 2 }) }),
              ui.Div({ key: 2, ...style({ minHeight: undefined, minWidth: undefined, flexShrink: undefined, '@import url("b.css")': {} }) }),
              ui.Div({ key: 3, ...style({ padding: 4 }), children: ui.Node(Id) }),
            ],
          })
        }) satisfies Tree,
      }
    : {}),
}

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
  ...SPLIT_CASES,
}

/**
 * Named nodes after a rule, each with an id below it, one in a Suspense
 * boundary: where a server writes styles in place, each writes its own
 * `<style>` before its element, as its twin does, and the browser renders the
 * same tree around it, so React keeps every id.
 */
const PLACE_CASES: Record<string, Tree> = {
  // Emotion's development build warns of `:first-child` on the server, so a sibling selector stands in.
  'named nodes after a parent’s rule, a runtime one between, ids below them, one in a Suspense boundary': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      ...style({ '& > *': RED }),
      children: [
        ui.Div({ key: 1, ...style({ padding: 2 }), children: ui.Node(Id) }),
        ui.Div({ key: 2, ...style({ order: 2 }, false), children: ui.Node(Id) }),
        ui.Suspense({
          key: 3,
          fallback: 'loading',
          children: [ui.Span('s', { key: 's', ...style({ order: 3 }) }), ui.Div({ key: 'd', ...style({ order: 4 }), children: ui.Node(Id) })],
        }),
        ui.Div({ key: 4, ...style({ order: 5 }), children: [ui.Node(Id, { key: 'i' }), ui.Span('t', { key: 't', ...style({ order: 6 }) })] }),
      ],
    })
  },
  'marked and unmarked named nodes in a row under a parent’s rule, an id after each': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      ...style({ '& + *': BLUE }),
      children: [
        ui.Span('a', { key: 'a', ...style({ order: 1 }) }),
        ui.Node(Id, { key: 'ia' }),
        ui.Span('b', { key: 'b', ...style.carrier({ order: 2 }) }),
        ui.Node(Id, { key: 'ib' }),
      ],
    })
  },
}

/**
 * Named nodes after a rule whose style is written already when they render:
 * by a named node before them under the same cache, or by a runtime node with
 * the same css. Such a node writes no `<style>` of its own, so the page's
 * signal must come from the style written first, whichever node wrote it.
 */
const SHARED_CASES: Record<string, Tree> = {
  'two named nodes with one style, an id below the second': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      children: [ui.Div({ key: 1, ...style({ padding: 2 }) }), ui.Div({ key: 2, ...style({ padding: 2 }), children: ui.Node(Id) }), ui.Node(Id, { key: 'i' })],
    })
  },
  'a named parent and child with one style, an id below the child': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      children: [
        ui.Div({ key: 1, ...style({ padding: 2 }), children: ui.Div({ ...style({ padding: 2 }), children: ui.Node(Id) }) }),
        ui.Node(Id, { key: 'i' }),
      ],
    })
  },
  'a runtime node, then a named node with the same style, an id below it': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    return ui.Div({
      children: [
        ui.Div({ key: 1, ...style({ padding: 2 }, false) }),
        ui.Div({ key: 2, ...style({ padding: 2 }), children: ui.Node(Id) }),
        ui.Node(Id, { key: 'i' }),
      ],
    })
  },
}

/**
 * Cases that mark no carrier: the walk carries each run at the first named node
 * of its stretch, as the compiler marks one, on the server and in the browser
 * alike. The carried cases below are the same trees as the compiler marks them.
 */
const UNMARKED_CASES: Record<string, Tree> = {
  'statics before components with ids': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId(), ...style({ order: 9 }) }).render() as import('react').ReactElement
    return ui.Div({
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

/** Cases with carriers marked: the host and the first named node after each component. */
const CARRIER_CASES: Record<string, Tree> = {
  // In development a named node's theme tokens are checked with nothing added
  // to the render, so the ids below it are the runtime twin's.
  'a named node reading a theme token, before a component with an id': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId(), ...style.carrier(BLUE) }).render() as import('react').ReactElement
    return ui.Div({
      ...style.carrier({ display: 'grid' }),
      children: [ui.Span('t', { key: 't', ...style({ color: 'var(--meonode-theme-primary-missing)' }) }), ui.Node(Id, { key: 'i' })],
    })
  },
  'statics before components with ids, carried': (ui, react, style) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId(), ...style.carrier({ order: 9 }) }).render() as import('react').ReactElement
    return ui.Div({
      ...style.carrier({ display: 'grid' }),
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
      children: [ui.Div({ key: 1, ...style({ order: 1 }, false) }), ui.Div({ key: 2, ...style({ order: 2 }) }), ui.Node(Id, { key: 3 })],
    })
  },
}

/** Loads the package afresh, so it reads whether a document exists as it loads. */
async function load() {
  vi.resetModules()
  const [ui, react, registry, theme, names, serialize, emotion, createCache, StyleRegistry, navigation] = await Promise.all([
    import('@src/main.js'),
    import('react'),
    import('@src/util/static-css.util.js'),
    import('@src/util/theme.util.js'),
    import('@src/util/style-name.util.js'),
    import('@emotion/serialize'),
    import('@emotion/react'),
    import('@emotion/cache').then(module => module.default),
    import('@src/components/style-registry.client.js').then(module => module.default),
    import('next/navigation.js'),
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
        carrier: (css: Css) => {
          if (!compiled) return { css }
          const { name, styles: text } = compile(css)
          registry.registerStaticCss(`m-${name}`, [[name, text]])
          return { __meo$: 2, __meo$n: name, __meo$r: 1 }
        },
      },
    )

  /**
   * The case's page, under a cache of its own unless `provider` is `'none'`, as
   * an app with a registry renders it, or under `StyleRegistry` for `'registry'`.
   */
  const page = (tree: Tree, compiled: boolean, provider: Provider | 'registry') => {
    // From a component, where an app's walk runs and reads its cache.
    const element = react.createElement(function Page() {
      return tree(ui, react, styles(compiled)).render() as import('react').ReactElement
    })
    if (provider === 'none') return element
    if (provider === 'registry') return react.createElement(StyleRegistry, null, element)
    // The insertion point is the page's, so only the browser's cache has one.
    const insertionPoint =
      provider === 'insertion-point' && typeof document !== 'undefined'
        ? (document.querySelector<HTMLElement>('meta[name="emotion-insertion-point"]') ?? undefined)
        : undefined
    return react.createElement(emotion.CacheProvider, { value: createCache({ key: 'css', prepend: provider === 'prepend', insertionPoint }) }, element)
  }
  return { react, page, ServerInsertedHTMLContext: navigation.ServerInsertedHTMLContext }
}

/** The attribute a server that writes styles in place marks one of them with. */
const PLACE_MARKER = 'data-meonode-place'

/** What jsdom's virtual console prints for a stylesheet its CSS parser rejects. */
const JSDOM_CSS_PARSE_ERROR = 'Could not parse CSS stylesheet'

/** How long React's scheduler gets to finish a hydration or an unmount: its tasks run on timers in a document with no frames. */
const HYDRATION_SETTLE_MS = 50

/**
 * Renders `tree` on the server, hydrates it in a document, and reads what came
 * of it. Under `'registry'`, the registry's flush goes into the head, as Next
 * puts it there.
 */
async function serverThenHydrate(tree: Tree, compiled: boolean, provider: Provider | 'registry') {
  const server = await load()
  const { renderToString } = await import('react-dom/server')
  const flushes: (() => import('react').ReactNode)[] = []
  const element = server.page(tree, compiled, provider)
  // What the server render reports, its registry's flush included, as React's development build warns there.
  const serverErrors: string[] = []
  const serverError = vi.spyOn(console, 'error').mockImplementation((...args) => void serverErrors.push(args.map(String).join(' ')))
  const html = renderToString(
    provider === 'registry'
      ? server.react.createElement(server.ServerInsertedHTMLContext.Provider, { value: flush => void flushes.push(flush) }, element)
      : element,
  )
  const head =
    provider === 'registry' ? renderToString(server.react.createElement(server.react.Fragment, null, ...flushes.map(flush => flush()))) : headOf(provider)
  serverError.mockRestore()
  /** How many `<style>` elements the server wrote. */
  const serverSheets = (head + html).match(/<style\b/g)?.length ?? 0

  // The page loads in a document of its own, with the globals a jsdom suite has.
  const browser = await builtinEnvironments.jsdom.setup(globalThis, {
    jsdom: { html: `<!doctype html><html><head>${head}</head><body><div id="root">${html}</div></body></html>` },
  })
  try {
    const client = await load()
    const errors: string[] = []
    // jsdom's CSS parser rejects a whole sheet with an unclosed `(` and says so;
    // a browser keeps the rules before it. That half is the parity suite's.
    const error = vi.spyOn(console, 'error').mockImplementation((...args) => {
      const message = args.map(String).join(' ')
      if (message !== JSDOM_CSS_PARSE_ERROR) errors.push(message)
    })
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
    /** The names each Emotion style element lists, in document order. */
    const names = [...document.querySelectorAll<HTMLStyleElement>('style[data-emotion]')].flatMap(sheet => sheet.dataset.emotion!.split(' ').slice(1))
    const result = {
      serverErrors,
      errors,
      serverSheets,
      sheets: document.querySelectorAll('style[data-emotion]').length,
      namesListedOnce: new Set(names).size === names.length,
      ids: before.length,
      idsKept: JSON.stringify(ids()) === JSON.stringify(before),
      firstPaint,
      rules: rules(),
      stylesLeftInBody: container.querySelectorAll('style').length,
      // The ids themselves differ between the two: the compiled tree has fewer fibers.
      markup: container.innerHTML.replaceAll(/ data-id="[^"]*"/g, ''),
      // Where the server wrote each style, the marker of a server that writes them in place aside.
      serverHtml: html.replaceAll(/ data-id="[^"]*"/g, '').replaceAll(` ${PLACE_MARKER}=""`, ''),
      fibers: {} as Record<string, number>,
    }
    // The committed tree's fibers by kind: a renderer, a Fragment, a leaf.
    const fibers: Record<string, number> = {}
    const rootKey = Object.keys(container).find(name => name.startsWith('__reactContainer$'))!
    const visit = (fiber: { type: unknown; tag: number; child: unknown; sibling: unknown } | null) => {
      for (; fiber; fiber = fiber.sibling as typeof fiber) {
        const type = fiber.type as { displayName?: string; name?: string } | string | null
        const kind = typeof type === 'string' ? `host:${type}` : type?.displayName || type?.name || `tag ${fiber.tag}`
        fibers[kind] = (fibers[kind] ?? 0) + 1
        visit(fiber.child as typeof fiber)
      }
    }
    visit((container as unknown as Record<string, { stateNode: { current: { child: never } } }>)[rootKey].stateNode.current.child)
    Object.assign(result, { fibers })
    root.unmount()
    // What the unmount scheduled runs here, while the document still exists.
    await new Promise(resolve => setTimeout(resolve, HYDRATION_SETTLE_MS))
    return result
  } finally {
    await browser.teardown(globalThis)
  }
}

/**
 * Renders `tree` on the server twice, into two roots of one page, hydrates
 * both, creates a third root after that and renders `tree` there, then renders
 * every root again. Reads whether hydration kept every id, and whether the
 * render after it kept every styled element.
 */
async function rootsThenHydrate(tree: Tree, compiled: boolean, provider: 'none' | 'cache') {
  const server = await load()
  const { renderToString } = await import('react-dom/server')
  const html = renderToString(server.page(tree, compiled, provider))
  const browser = await builtinEnvironments.jsdom.setup(globalThis, {
    jsdom: { html: `<!doctype html><html><head></head><body><div id="a">${html}</div><div id="b">${html}</div><div id="c"></div></body></html>` },
  })
  try {
    const client = await load()
    const errors: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args.map(String).join(' ')))
    const { createRoot, hydrateRoot } = await import('react-dom/client')
    const containers = ['a', 'b', 'c'].map(id => document.getElementById(id)!)
    const ids = (container: Element) => [...container.querySelectorAll('[data-id]')].map(element => element.getAttribute('data-id'))
    const before = containers.slice(0, 2).map(ids)
    const options = { onRecoverableError: (reported: unknown) => void errors.push(String(reported)) }
    // Each root keeps its element, so rendering it again renders the same component types.
    const pages = containers.map(() => client.page(tree, compiled, provider))
    /** The same page again, as new elements, so its components render again. */
    const again = (element: import('react').ReactElement<{ children?: unknown }>) => {
      const child = element.props.children
      return client.react.isValidElement(child) ? client.react.cloneElement(element, {}, client.react.cloneElement(child)) : client.react.cloneElement(element)
    }
    const roots = containers.slice(0, 2).map((container, index) => hydrateRoot(container, pages[index]!, options))
    await new Promise(r => setTimeout(r, HYDRATION_SETTLE_MS))
    const idsHydrated = containers.slice(0, 2).every((container, index) => JSON.stringify(ids(container)) === JSON.stringify(before[index]))
    // The styled elements: the ones a node whose type changed would replace. A
    // case's id component is made anew by each render of its tree, so it remounts.
    const styled = (container: Element) => [...container.querySelectorAll('[class]')]
    const elements = containers.slice(0, 2).map(styled)
    const late = createRoot(containers[2]!, options)
    late.render(pages[2]!)
    await new Promise(r => setTimeout(r, HYDRATION_SETTLE_MS))
    const lateElements = styled(containers[2]!)
    ;[...roots, late].forEach((root, index) => root.render(again(pages[index]! as never)))
    await new Promise(r => setTimeout(r, HYDRATION_SETTLE_MS))
    error.mockRestore()
    const kept = (container: Element, was: Element[]) => {
      const now = styled(container)
      return now.length > 0 && now.length === was.length && now.every((element, index) => element === was[index])
    }
    const result = {
      errors,
      idsKept: idsHydrated,
      elementsKept: containers.slice(0, 2).every((container, index) => kept(container, elements[index]!)) && kept(containers[2]!, lateElements),
      markup: containers.map(container => container.innerHTML.replaceAll(/ data-id="[^"]*"/g, '')),
    }
    for (const root of [...roots, late]) root.unmount()
    await new Promise(r => setTimeout(r, HYDRATION_SETTLE_MS))
    return result
  } finally {
    await browser.teardown(globalThis)
  }
}

/** A page whose Suspense boundary waits on `data`, given in. */
type LateTree = (ui: Main, react: typeof import('react'), style: Style, data: Promise<string>) => import('@src/main.js').NodeInstance

/** The first line of React's report of a hydration mismatch. */
const HYDRATION_FAILED =
  "Error: Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"

/** The first line of React's production build's report of a hydration mismatch. */
const HYDRATION_FAILED_PRODUCTION =
  'Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'

/** How long a streamed boundary takes to be revealed and hydrated: past React's reveal throttle of 300 ms. */
const REVEAL_SETTLE_MS = 400

/** How long the server holds the boundary after the shell went out, so it streams in a chunk of its own. */
const LATE_BOUNDARY_MS = 20

/**
 * Streams `tree` with React's server renderer, the boundary's content after the
 * shell, then loads the shell in a document, hydrates it, and appends the
 * boundary's chunk, as a browser receives it, running its script.
 */
async function streamThenHydrate(tree: LateTree, compiled: boolean, provider: 'none' | 'cache') {
  const server = await load()
  const { renderToPipeableStream } = await import('react-dom/server')
  const { Writable } = await import('node:stream')
  let resolve!: (value: string) => void
  const pending = new Promise<string>(r => (resolve = r))
  const serverErrors: string[] = []
  const serverError = vi.spyOn(console, 'error').mockImplementation((...args) => void serverErrors.push(args.map(String).join(' ')))
  const { shell, completion } = await new Promise<{ shell: string; completion: string }>((done, fail) => {
    let written = ''
    let shellText = ''
    const sink = new Writable({
      write(chunk, _, callback) {
        written += chunk
        callback()
      },
      final(callback) {
        done({ shell: shellText, completion: written.slice(shellText.length) })
        callback()
      },
    })
    const { pipe } = renderToPipeableStream(
      server.page((ui, react, style) => tree(ui, react, style, pending), compiled, provider),
      {
        onShellReady() {
          pipe(sink)
          setTimeout(() => {
            shellText = written
            resolve('late')
          }, LATE_BOUNDARY_MS)
        },
        onShellError: fail,
      },
    )
  })
  serverError.mockRestore()

  // Frames, which React's streaming scripts time a boundary's reveal by.
  const browser = await builtinEnvironments.jsdom.setup(globalThis, {
    jsdom: { html: `<!doctype html><html><head></head><body><div id="root">${shell}</div></body></html>`, pretendToBeVisual: true },
  })
  try {
    const client = await load()
    const errors: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args.map(String).join(' ')))
    const { hydrateRoot } = await import('react-dom/client')
    // The document is still loading until the boundary's chunk is in: React
    // takes a pending boundary in a loaded document as one the server gave up on.
    let readyState: DocumentReadyState = 'loading'
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => readyState })
    const container = document.getElementById('root')!
    const ids = () => [...document.querySelectorAll('[data-id]')].map(element => element.getAttribute('data-id'))
    const rules = () =>
      [...document.querySelectorAll<HTMLStyleElement>('style[data-emotion]')].flatMap(element => [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText))
    // The browser's own data is in hand: React reads a fulfilled thenable at once.
    const data = Object.assign(Promise.resolve('late'), { status: 'fulfilled', value: 'late' })
    const root = hydrateRoot(
      container,
      client.page((ui, react, style) => tree(ui, react, style, data), compiled, provider),
      {
        onRecoverableError: reported => void errors.push(String(reported)),
      },
    )
    await new Promise(r => setTimeout(r, HYDRATION_SETTLE_MS))
    const shellIds = ids()
    // The boundary's chunk, as the parser appends it to the body: its script runs.
    const chunk = document.createElement('template')
    chunk.innerHTML = completion
    for (const node of [...chunk.content.childNodes]) {
      if (node.nodeName !== 'SCRIPT') document.body.appendChild(node)
      else document.body.appendChild(Object.assign(document.createElement('script'), { textContent: node.textContent }))
    }
    readyState = 'complete'
    // React reveals a boundary no sooner than its throttle after the last, then hydrates it.
    await new Promise(r => setTimeout(r, REVEAL_SETTLE_MS))
    const lateIds = ids()
    await new Promise(r => setTimeout(r, HYDRATION_SETTLE_MS))
    error.mockRestore()
    const result = {
      serverErrors,
      // React's message, without the tree it prints, whose component names are each build's own.
      errors: errors.map(message => message.split('\n')[0]),
      shellIdsKept: JSON.stringify(ids().slice(0, shellIds.length)) === JSON.stringify(shellIds),
      lateIdsKept: JSON.stringify(ids()) === JSON.stringify(lateIds),
      rules: rules(),
      stylesLeftInBody: container.querySelectorAll('style').length,
      markup: container.innerHTML.replaceAll(/ data-id="[^"]*"/g, ''),
      shellHtml: shell.replaceAll(/ data-id="[^"]*"/g, '').replaceAll(` ${PLACE_MARKER}=""`, ''),
      shellMarked: shell.includes(PLACE_MARKER),
    }
    root.unmount()
    await new Promise(r => setTimeout(r, HYDRATION_SETTLE_MS))
    return result
  } finally {
    await browser.teardown(globalThis)
  }
}

/** Pages whose boundary streams after the shell, named nodes after a rule in both, an id below each. */
const LATE_CASES: Record<string, LateTree> = {
  'named nodes after a rule in the shell and in a late boundary, ids below them': (ui, react, style, data) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    const Late = () =>
      ui
        .Div({ ...style({ '& > *': RED }), children: [ui.Span(react.use(data), { key: 'l', ...style({ order: 7 }) }), ui.Node(Id, { key: 'i' })] })
        .render() as import('react').ReactElement
    return ui.Div({
      ...style({ '& + *': BLUE }),
      children: [
        ui.Div({ key: 1, ...style({ padding: 2 }), children: ui.Node(Id) }),
        ui.Suspense({ key: 2, fallback: ui.Span('loading', style({ order: 8 })), children: ui.Node(Late) }),
        ui.Div({ key: 3, ...style({ order: 9 }), children: ui.Node(Id) }),
      ],
    })
  },
  'a shell with no named style, named nodes after a rule only in the late boundary': (ui, react, style, data) => {
    const Id = () => ui.Span('id', { 'data-id': react.useId() }).render() as import('react').ReactElement
    const Late = () =>
      ui
        .Div({ ...style({ '& > *': RED }), children: [ui.Span(react.use(data), { key: 'l', ...style({ order: 7 }) }), ui.Node(Id, { key: 'i' })] })
        .render() as import('react').ReactElement
    return ui.Div({ children: [ui.Node(Id, { key: 1 }), ui.Suspense({ key: 2, fallback: 'loading', children: ui.Node(Late) })] })
  },
}

/**
 * What a hydration came to, without how many `<style>` elements carried the
 * rules: the runtime twin writes one per node, a compiled page one per run.
 */
function hydrated(result: Awaited<ReturnType<typeof serverThenHydrate>>) {
  const { serverSheets: _, sheets: __, fibers: ___, ...rest } = result
  return rest
}

/** The kinds of fiber a node's rendering adds: renderers, hosts and components; no context provider, which React's builds name differently. */
const meoNodeFibers = (fibers: Record<string, number>) =>
  Object.fromEntries(Object.entries(fibers).filter(([kind]) => kind === 'Styled' || kind === 'Id' || kind.startsWith('host:')))

/** Each placement case's fibers under StyleRegistry, as hydrated before slots existed. */
const REGISTRY_FIBERS: Record<string, Record<string, number>> = {
  'named nodes after a parent’s rule, a runtime one between, ids below them, one in a Suspense boundary': {
    Id: 4,
    Styled: 5,
    'host:div': 5,
    'host:span': 6,
  },
  'marked and unmarked named nodes in a row under a parent’s rule, an id after each': {
    Id: 2,
    Styled: 2,
    'host:div': 1,
    'host:span': 4,
  },
}

afterAll(() => vi.resetModules())

describe.each(PROVIDERS)('a server-rendered page %s, with compiled nodes, hydrates as its runtime twin does', (_, provider) => {
  it.each(Object.entries(CASES))('%s', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ serverErrors: [], errors: [], idsKept: true, stylesLeftInBody: 0 })
    expect(expected.firstPaint.length).toBeGreaterThan(0)
    expect(expected.firstPaint).toEqual(expected.rules)
    expect(hydrated(await serverThenHydrate(tree, true, provider))).toEqual(hydrated(expected))
  })
})

describe.each(PROVIDERS)('a server-rendered page %s, with carriers, hydrates as its runtime twin does', (_, provider) => {
  it.each(Object.entries(CARRIER_CASES))('%s', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ serverErrors: [], errors: [], idsKept: true, stylesLeftInBody: 0 })
    expect(expected.firstPaint.length).toBeGreaterThan(0)
    expect(hydrated(await serverThenHydrate(tree, true, provider))).toEqual(hydrated(expected))
  })
})

describe.each(PROVIDERS)('a server-rendered page %s, with no carrier marked, hydrates as its runtime twin does', (_, provider) => {
  it.each(Object.entries(UNMARKED_CASES))('%s', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ serverErrors: [], errors: [], idsKept: true, stylesLeftInBody: 0 })
    expect(hydrated(await serverThenHydrate(tree, true, provider))).toEqual(hydrated(expected))
  })
})

describe.each(PROVIDERS)('a server-rendered page %s, with named nodes after a rule, writes and hydrates as its runtime twin does', (_, provider) => {
  it.each(Object.entries({ ...PLACE_CASES, ...SHARED_CASES }))('%s', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ serverErrors: [], errors: [], idsKept: true, stylesLeftInBody: 0 })
    expect(expected.ids).toBeGreaterThan(1)
    expect(hydrated(await serverThenHydrate(tree, true, provider))).toEqual(hydrated(expected))
  })
})

// A boundary streamed after the shell: Emotion's cache moved the shell's
// styles when it was created, but a late chunk's arrive in place after that.
// Whatever the browser makes of them, a compiled page makes the same as its
// twin, and the shell signals a server that writes in place wherever it holds
// a named style.
describe.each([
  ['with no cache provider', 'none'],
  ['under a cache provider', 'cache'],
] as const)('a streamed page %s, its boundary after the shell', (_, provider) => {
  it.each(Object.entries(LATE_CASES))('%s: writes and hydrates as its runtime twin does', async (_, tree) => {
    const expected = await streamThenHydrate(tree, false, provider)
    expect(expected.serverErrors).toEqual([])
    // Emotion's cache moved the shell's styles when it was created; the late
    // chunk's stay in place, so the twin's own hydration of the boundary fails.
    expect(expected.errors).toContain(process.env.NODE_ENV === 'production' ? HYDRATION_FAILED_PRODUCTION : HYDRATION_FAILED)
    const compiled = await streamThenHydrate(tree, true, provider)
    const { shellMarked, ...rest } = compiled
    expect({ ...rest, shellMarked: false }).toEqual({ ...expected, shellMarked: false })
    expect(shellMarked).toBe(expected.shellHtml.includes('<style'))
  })
})

// The browser reads once, for the whole page, whether a server wrote its
// styles in place: two roots hydrated from such a server, and one created after
// them, all give each named node after a rule its place, and none ever changes
// an element's type when it renders again.
describe.each([
  ['with no cache provider', 'none'],
  ['under a cache provider', 'cache'],
] as const)('a page of two server-rendered roots %s, and a root created after hydration', (_, provider) => {
  it.each(Object.entries({ ...PLACE_CASES, ...SHARED_CASES }))('%s: keeps every element and id, as its runtime twin does', async (_, tree) => {
    const expected = await rootsThenHydrate(tree, false, provider)
    expect(expected).toMatchObject({ errors: [], idsKept: true, elementsKept: true })
    expect(await rootsThenHydrate(tree, true, provider)).toEqual(expected)
  })
})

// StyleRegistry collects every style into the head, so nothing is written in
// place and no named node gets a slot: the fibers are what they were before
// slots existed.
describe('a server-rendered page under StyleRegistry, with named nodes after a rule', () => {
  it.each(Object.entries(PLACE_CASES))('%s: hydrates as its runtime twin does, with no fiber added', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, 'registry')
    expect(expected).toMatchObject({ serverErrors: [], errors: [], idsKept: true, stylesLeftInBody: 0 })
    const compiled = await serverThenHydrate(tree, true, 'registry')
    expect(hydrated(compiled)).toEqual(hydrated(expected))
    // React's production build names no context provider, so only the kinds MeoNode adds are pinned.
    expect(meoNodeFibers(compiled.fibers)).toEqual(REGISTRY_FIBERS[_])
  })
})

// With no provider each named node writes its own `<style>` before its element,
// as its twin does, so no style shares one; a registry's flush joins them, and
// splits it where a sheet edge must be. Emotion's cache adopts each element by
// the names it lists, so hydration keeps every element, adds none, and lists no
// name twice. The runtime twin splits under a registry too.
describe('a server-rendered page whose named styles need a sheet edge', () => {
  it.each(Object.entries(SPLIT_CASES))('%s: writes one element per node and hydrates with each element kept, none added', async (_, tree) => {
    const result = await serverThenHydrate(tree, true, 'none')
    expect(result).toMatchObject({ serverErrors: [], errors: [], idsKept: true, stylesLeftInBody: 0, serverSheets: 3, sheets: 3, namesListedOnce: true })
  })

  it.each(Object.entries(SPLIT_CASES))('%s: under StyleRegistry, hydrates as its runtime twin does, the flush split', async (_, tree) => {
    const expected = await serverThenHydrate(tree, false, 'registry')
    expect(expected).toMatchObject({ serverErrors: [], errors: [], idsKept: true, stylesLeftInBody: 0, serverSheets: 2, sheets: 2, namesListedOnce: true })
    expect(expected.firstPaint).toEqual(expected.rules)
    expect(hydrated(await serverThenHydrate(tree, true, 'registry'))).toEqual(hydrated(expected))
  })
})

// The providers place the rules on either side of the page's stylesheet, so a
// compiled page that put its rules anywhere else would not match its twin.
describe('the providers, for the runtime twin', () => {
  it('put the rules after the page’s stylesheet when appending, ahead of it when prepending or after an insertion point', async () => {
    const [, tree] = Object.entries(CASES)[0]
    const pageAt = async (provider: Provider) => {
      const { rules } = await serverThenHydrate(tree, false, provider)
      expect(rules.length).toBeGreaterThan(1)
      return rules.indexOf('page') === 0 ? 'first' : rules.indexOf('page') === rules.length - 1 ? 'last' : 'between'
    }
    expect(await pageAt('append')).toBe('first')
    expect(await pageAt('prepend')).toBe('last')
    expect(await pageAt('insertion-point')).toBe('last')
  })
})
