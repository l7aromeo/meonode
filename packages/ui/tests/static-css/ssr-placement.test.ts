// @vitest-environment jsdom
//
// Where a server-rendered page's static rules sit once it hydrates under an
// Emotion cache that prepends, as MUI's injectFirst does. The page's own
// stylesheet comes ahead of what React hoisted; on hydration Emotion moves its
// styles ahead of that stylesheet, which then wins a tie, and the static rules
// the server sent must move there with them.
import { CacheProvider } from '@emotion/react'
import createCache, { type EmotionCache } from '@emotion/cache'
import { act, createElement, type ReactElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Div } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'

/**
 * Whether the plugin extracted css from this file too. Extracted, a reference node's css written here becomes a named node's, registered at the module's top level, which the reset between tests forgets; these cases need it on the runtime path. Extraction's own placement is checked by the named-* suites.
 */
const EXTRACTED = process.env.MEONODE_EXTRACTED === '1'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PADDING = 'mn-0000000000p16'
const register = () => registerStaticCss('card', [[1, PADDING, `.${PADDING}{padding:16px;}`]])

function App({ cache, runtime = true }: { cache?: EmotionCache; runtime?: boolean }): ReactElement {
  const page = Div({
    children: [
      Div({ __meo$: 2, __meo$s: PADDING, key: 'card', className: 'card', children: 'card' } as never),
      runtime ? Div({ key: 'runtime', css: { margin: 3 }, children: 'runtime' }) : null,
    ],
  }).render() as ReactElement
  return createElement(
    'html',
    null,
    createElement('head', null),
    createElement('body', null, cache ? createElement(CacheProvider, { value: cache }, page) : page),
  )
}

/** The head's children, named by what they are, runs of one kind merged. */
const order = () =>
  [...document.head.children]
    .map(element =>
      element.getAttribute('data-precedence') === 'meonode'
        ? 'server-runtime'
        : element.getAttribute('data-precedence')?.startsWith('mn-static-')
          ? 'static'
          : element.hasAttribute('data-meonode-static')
            ? 'static'
            : element.getAttribute('data-emotion')?.split(' ')[0] || element.getAttribute('data-name') || element.tagName,
    )
    .filter((name, index, names) => name !== names[index - 1])

afterEach(() => {
  NodeUtil.isServer = false
  __resetStaticCss()
})

/** The static styles' buckets in head order, the server's and the browser's. */
const buckets = () =>
  [...document.head.querySelectorAll<HTMLStyleElement>('style[data-precedence^="mn-static-"], style[data-meonode-static]')].map(
    element => element.getAttribute('data-precedence') ?? `sheet-${element.getAttribute('data-meonode-static')}`,
  )

/**
 * Renders the page on the server, loads it, puts the page's own stylesheet in
 * the head (ahead of what React hoisted when `userFirst`, after it otherwise),
 * and hydrates it under `cache`.
 */
function hydrateUnder(cache: (head: HTMLHeadElement) => EmotionCache, userFirst: boolean, runtime = true, serverRuntime = false): void {
  __resetStaticCss()
  register()
  NodeUtil.isServer = true
  let html: string
  try {
    html = renderToString(createElement(App, { runtime }))
  } finally {
    NodeUtil.isServer = false
  }
  document.open()
  document.write(html)
  document.close()
  const user = document.createElement('style')
  user.setAttribute('data-name', 'user')
  user.textContent = '.card{padding:0}'
  if (userFirst) document.head.prepend(user)
  else document.head.append(user)
  if (serverRuntime) {
    // A server component's runtime rule, as React hoists it for an RSC page.
    const hoisted = document.createElement('style')
    hoisted.setAttribute('data-precedence', 'meonode')
    hoisted.setAttribute('data-href', 'css-server')
    hoisted.textContent = '.css-server{margin:1px}'
    document.head.querySelector('style[data-precedence="mn-static-4"]')!.after(hoisted)
  }
  __resetStaticCss()
  register()
  act(() => void hydrateRoot(document, createElement(App, { cache: cache(document.head), runtime })))
}

const SERVER_AND_BROWSER_BUCKETS = [
  'mn-static-0',
  'sheet-0',
  'mn-static-1',
  'sheet-1',
  'mn-static-2',
  'sheet-2',
  'mn-static-3',
  'sheet-3',
  'mn-static-4',
  'sheet-4',
]

describe.skipIf(EXTRACTED)('a server-rendered page, once hydrated, has its static rules where the cache’s rules are', () => {
  // The page's stylesheet comes ahead of what React hoisted, as a framework's or a
  // page shell's does; Emotion moves its styles ahead of it, so it wins a tie.
  it('ahead of the page’s stylesheet under a cache that prepends', () => {
    hydrateUnder(head => createCache({ key: 'css', prepend: true, container: head }), true)
    expect(order()).toEqual(['static', 'css', 'user'])
    expect(buckets()).toEqual(SERVER_AND_BROWSER_BUCKETS)
  })

  it('ahead of the page’s stylesheet under a cache that prepends, when React hoisted them first', () => {
    hydrateUnder(head => createCache({ key: 'css', prepend: true, container: head }), false)
    expect(order()).toEqual(['static', 'css', 'user'])
    expect(buckets()).toEqual(SERVER_AND_BROWSER_BUCKETS)
  })

  // With no Emotion rule yet, the cache will put its first tag at the head's
  // start, which is where React hoisted the static styles.
  it('ahead of the page’s stylesheet under a cache that prepends and has no rules yet', () => {
    hydrateUnder(head => createCache({ key: 'css', prepend: true, container: head }), false, false)
    expect(order()).toEqual(['static', 'user'])
    expect(buckets()).toEqual(SERVER_AND_BROWSER_BUCKETS)
  })

  // An RSC page: React hoisted server components' runtime rules after the static
  // ones, and the static rules stay ahead of those too.
  it('ahead of the runtime rules React hoisted for server components', () => {
    hydrateUnder(head => createCache({ key: 'css', container: head }), false, true, true)
    expect(order()).toEqual(['static', 'server-runtime', 'user', 'css'])
    expect(buckets()).toEqual(SERVER_AND_BROWSER_BUCKETS)
  })

  // Emotion appends after the page's stylesheet, so it wins a tie.
  it('after the page’s stylesheet under a cache that appends', () => {
    hydrateUnder(head => createCache({ key: 'css', container: head }), true)
    expect(order()).toEqual(['user', 'static', 'css'])
    expect(buckets()).toEqual(SERVER_AND_BROWSER_BUCKETS)
  })
})

/**
 * Renders the page on the server as a fragment, as Vite's SSR or a page template
 * does, into `#root` of a page whose head holds `head` and the page's own
 * stylesheet, and hydrates it there under `cache`. React leaves the styles it
 * would hoist where they render, in `#root`.
 */
function hydrateFragmentUnder(cache: (head: HTMLHeadElement) => EmotionCache, head: string): void {
  __resetStaticCss()
  register()
  NodeUtil.isServer = true
  let html: string
  try {
    html = renderToString(createElement(Page))
  } finally {
    NodeUtil.isServer = false
  }
  document.open()
  document.write(`<!doctype html><html><head>${head}<style data-name="user">.card{padding:0}</style></head><body><div id="root">${html}</div></body></html>`)
  document.close()
  __resetStaticCss()
  register()
  const root = document.getElementById('root')!
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    act(() => void hydrateRoot(root, createElement(Page, { cache: cache(document.head) }), { onRecoverableError: error => console.error(error) }))
    // Moving the styles out of `#root` leaves hydration as it was.
    expect(errors).not.toHaveBeenCalled()
  } finally {
    errors.mockRestore()
  }
}

function Page({ cache }: { cache?: EmotionCache }): ReactElement {
  const page = Div({
    children: [
      Div({ __meo$: 2, __meo$s: PADDING, key: 'card', className: 'card', children: 'card' } as never),
      Div({ key: 'runtime', css: { margin: 3 }, children: 'runtime' }),
    ],
  }).render() as ReactElement
  return cache ? createElement(CacheProvider, { value: cache }, page) : page
}

/** The static styles still in the body. */
const inBody = () => document.body.querySelectorAll('style[data-precedence^="mn-static-"], style[data-meonode-static]').length

describe.skipIf(EXTRACTED)('a page server-rendered as a fragment, once hydrated, has its static rules where the cache’s rules are', () => {
  // Emotion's client cache moves the server's styles out of the body into the
  // head, to where its own tags go; the static styles go with them.
  it('at the head’s start under a cache that prepends', () => {
    hydrateFragmentUnder(head => createCache({ key: 'css', prepend: true, container: head }), '')
    expect(order()).toEqual(['static', 'css', 'user'])
    expect(buckets()).toEqual(SERVER_AND_BROWSER_BUCKETS)
    expect(inBody()).toBe(0)
  })

  it('after the insertion point under a cache that has one', () => {
    hydrateFragmentUnder(
      head => createCache({ key: 'css', insertionPoint: head.querySelector<HTMLElement>('meta[name="emotion-insertion-point"]')!, container: head }),
      '<meta name="emotion-insertion-point" content="">',
    )
    expect(order()).toEqual(['META', 'static', 'css', 'user'])
    expect(buckets()).toEqual(SERVER_AND_BROWSER_BUCKETS)
    expect(inBody()).toBe(0)
  })

  // Runtime rules inserted after hydration go to the head, so static rules left
  // in the body would win a tie the runtime rule rendered after them wins uncompiled.
  it('at the head’s end under a cache that appends', () => {
    hydrateFragmentUnder(head => createCache({ key: 'css', container: head }), '')
    expect(order()).toEqual(['user', 'static', 'css'])
    expect(buckets()).toEqual(SERVER_AND_BROWSER_BUCKETS)
    expect(inBody()).toBe(0)
  })
})
