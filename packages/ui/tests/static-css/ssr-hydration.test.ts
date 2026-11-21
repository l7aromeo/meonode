// @vitest-environment jsdom
//
// A server-rendered document with compiled nodes, hydrated in the browser.
//
// The server pass runs with `NodeUtil.isServer` set, the one switch the runtime
// reads to take its server branch. The browser pass starts from the registry as a
// fresh page has it: empty, then filled by the compiled modules as they load,
// before `hydrateRoot`.
import { createElement, Fragment, Suspense, useEffect, useId } from 'react'
import { act } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Div, Node, Span } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'
import { __resetStaticCss, registerStaticCss, STATIC_CSS_PREFIX } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RED = 'mn-000000000000r'
const WIDE = 'mn-000000000000w'
const MEDIA = 'mn-000000000000m'
const LATE = 'mn-000000000000l'

const RED_RULE = `.${RED}{color:red;}`
const WIDE_RULE = `.${WIDE}{width:var(--mv-000000000000w);}`
const MEDIA_RULE = `@media (min-width: 600px){.${MEDIA}{padding:9px;}}`
const LATE_RULE = `.${LATE}{margin:1px;}`

/** The two compiled modules: the page's, and one only a component inside a Suspense boundary uses. */
const registerPage = () =>
  registerStaticCss('page', [
    [0, RED, RED_RULE],
    [0, WIDE, WIDE_RULE],
    [2, MEDIA, MEDIA_RULE],
  ])
const registerLate = () => registerStaticCss('late', [[0, LATE, LATE_RULE]])

/** The ids the browser computed, by probe. After an attribute mismatch the DOM keeps the server's, and production React reports nothing. */
const clientIds: Record<string, string> = {}

/**
 * Reads an id the way a component library does. Its position is what makes a
 * change of shape show: React writes a child's index in as many bits as its
 * siblings' count needs, so a slot missing in the browser shifts the ids below a
 * host whose count it would take past a power of two (3 children to 4 here), as
 * long as another fork lies below.
 */
function Labelled({ name }: { name: string }) {
  const id = useId()
  useEffect(() => void (clientIds[name] = id), [name, id])
  return createElement('label', { htmlFor: id, 'data-probe': name }, name)
}

/** A component with its own render, so its static css is its own walk's. */
const Late = () => Span('late', { __meo$: 2, __meo$s: LATE } as never).render()

function App() {
  return createElement(
    'html',
    null,
    createElement('head', null, createElement('title', null, 't')),
    createElement(
      'body',
      null,
      Div({
        __meo$: 2,
        __meo$s: `${RED} ${WIDE}`,
        __meo$v: { '--mv-000000000000w': '8px' },
        __meo$d: { className: 'own', id: 'plain' },
        // Three children, so the slot takes the count to four.
        children: [
          createElement(Labelled, { key: 'l', name: 'first' }),
          Div({
            __meo$: 2,
            __meo$s: MEDIA,
            __meo$c: { padding: 4 },
            id: 'partial',
            children: ['b', createElement(Labelled, { key: 'p', name: 'in-partial' })],
          } as never),
          createElement('p', { key: 'q' }, createElement(Labelled, { name: 'nested' }), 'x'),
        ],
      } as never).render(),
      createElement(Labelled, { name: 'after' }),
      // A carrier whose last child is text: the server separates the text from the slot.
      Div({ __meo$: 2, __meo$s: RED, id: 'text', children: 't' } as never).render(),
      createElement(Suspense, { fallback: 'loading' }, createElement(Late)),
    ),
  )
}

const HYDRATION_MARKERS = [/did not match/i, /hydration failed/i, /server rendered/i, /text content does not match/i, /server html/i, /#418/]

function serverRender(): string {
  __resetStaticCss()
  registerPage()
  registerLate()
  NodeUtil.isServer = true
  try {
    return renderToString(createElement(App))
  } finally {
    NodeUtil.isServer = false
  }
}

/** Loads `html` as the page, registers the modules as the browser would, and hydrates. */
async function hydrate(html: string, loadModules: () => void): Promise<string[]> {
  document.open()
  document.write(html)
  document.close()
  __resetStaticCss()
  loadModules()
  const messages: string[] = []
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void messages.push(args.map(String).join(' ')))
  try {
    await act(async () => {
      hydrateRoot(document, createElement(App), { onRecoverableError: error => void messages.push(String(error)) })
    })
  } finally {
    errorSpy.mockRestore()
  }
  return messages.filter(message => HYDRATION_MARKERS.some(marker => marker.test(message)))
}

const precedenceGroups = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLStyleElement>('style[data-precedence]')].map(element => [
    element.getAttribute('data-precedence'),
    element.getAttribute('data-href'),
    element.textContent,
  ])

afterEach(() => {
  NodeUtil.isServer = false
  vi.restoreAllMocks()
})

describe('a server-rendered document with static css', () => {
  it('sends each class once, as hoisted styles in bucket order, parents first', async () => {
    const html = serverRender()
    const doc = new DOMParser().parseFromString(html, 'text/html')

    expect(precedenceGroups(doc.head)).toEqual([
      [
        `${STATIC_CSS_PREFIX}0`,
        `${STATIC_CSS_PREFIX}0 ${STATIC_CSS_PREFIX}${RED} ${STATIC_CSS_PREFIX}${WIDE} ${STATIC_CSS_PREFIX}${LATE}`,
        RED_RULE + WIDE_RULE + LATE_RULE,
      ],
      [`${STATIC_CSS_PREFIX}1`, `${STATIC_CSS_PREFIX}1`, ''],
      [`${STATIC_CSS_PREFIX}2`, `${STATIC_CSS_PREFIX}2 ${STATIC_CSS_PREFIX}${MEDIA}`, MEDIA_RULE],
      [`${STATIC_CSS_PREFIX}3`, `${STATIC_CSS_PREFIX}3`, ''],
    ])
    // Nothing static is left in the body. (Emotion writes its own there only on a
    // server with no document, which this suite is not.)
    expect([...doc.body.querySelectorAll('style')].filter(element => !element.hasAttribute('data-emotion'))).toEqual([])
  })

  it('renders the elements with their static classes and variables', async () => {
    const doc = new DOMParser().parseFromString(serverRender(), 'text/html')

    const plain = doc.getElementById('plain')!
    expect(plain.className).toBe(`${RED} ${WIDE} own`)
    expect(plain.getAttribute('style')).toBe('--mv-000000000000w:8px')
    expect(doc.getElementById('partial')!.className).toMatch(new RegExp(`^${MEDIA} css-`))
  })

  it('hydrates with no mismatch, ids intact, and inserts nothing the server sent', async () => {
    const html = serverRender()
    const serverIds = Object.fromEntries(
      [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('label')].map(label => [label.dataset.probe, label.htmlFor]),
    )
    for (const name of Object.keys(clientIds)) delete clientIds[name]
    const errors = await hydrate(html, () => {
      registerPage()
      registerLate()
    })

    expect(errors).toEqual([])
    expect(Object.keys(serverIds)).toEqual(['first', 'in-partial', 'nested', 'after'])
    expect(clientIds).toEqual(serverIds)
    expect(document.querySelectorAll('style[data-meonode-static]')).toHaveLength(0)
  })

  // A module's classes reach the page when a node using them renders, not when it
  // loads, so this test renders one; registering alone inserts nothing.
  it('inserts only a class the server did not send, once a node uses it, in the bucket order', async () => {
    const html = serverRender()
    await hydrate(html, () => {
      registerPage()
      registerLate()
      registerStaticCss('client-only', [[1, 'mn-000000000000c', '.mn-000000000000c:hover{color:blue;}']])
    })
    const ownRules = () => [...document.head.querySelectorAll<HTMLStyleElement>('style[data-meonode-static]')].map(element => element.sheet!.cssRules.length)
    expect(ownRules().every(count => count === 0)).toBe(true)

    const container = document.createElement('div')
    document.body.append(container)
    // `document.write` gave the page a new head; Emotion's default cache still
    // holds the one before it, so this root gets a cache for the page's own.
    await act(async () => {
      createRoot(container).render(
        createElement(
          CacheProvider,
          { value: createCache({ key: 'css', container: document.head }) },
          Div({ __meo$: 2, __meo$s: 'mn-000000000000c' } as never).render(),
        ),
      )
    })

    const order = [...document.head.querySelectorAll('style')].map(
      element => element.getAttribute('data-precedence') ?? `own ${element.getAttribute('data-meonode-static')}`,
    )
    expect(order.slice(0, 8)).toEqual([
      `${STATIC_CSS_PREFIX}0`,
      'own 0',
      `${STATIC_CSS_PREFIX}1`,
      'own 1',
      `${STATIC_CSS_PREFIX}2`,
      'own 2',
      `${STATIC_CSS_PREFIX}3`,
      'own 3',
    ])
    expect(ownRules()).toEqual([0, 1, 0, 0])
  })
})

describe('a server render without static css', () => {
  it('sends no static styles', () => {
    __resetStaticCss()
    NodeUtil.isServer = true
    try {
      const html = renderToString(createElement(Fragment, null, Div({ id: 'x', children: 'x' }).render()))
      expect(html).toBe('<div id="x">x</div>')
    } finally {
      NodeUtil.isServer = false
    }
  })
})

// In development a node's undefined theme token is checked without adding to the
// tree: one in the scope of `StaticStyles` while rendering, on both sides, and
// one under a component in the browser after commit. The host under the
// component has three children, so a slot added on either side alone would take
// it to four and shift the ids below.
describe('a server-rendered document whose static css references an undefined theme token, in development', () => {
  const MISSING = 'mn-00000000000mt'
  const MISSING_RULE = `.${MISSING}{color:var(--meonode-theme-primary-missing);}`
  const registerTokens = () => registerStaticCss('tokens', [[0, MISSING, MISSING_RULE]])

  const Wrapper = ({ children }: { children?: unknown }) => children as ReturnType<typeof createElement>

  function TokenApp() {
    return createElement(
      'html',
      null,
      createElement('head', null, createElement('title', null, 't')),
      createElement(
        'body',
        null,
        Div({
          __meo$: 2,
          __meo$s: MISSING,
          id: 'scoped',
          children: [
            createElement(Labelled, { key: 'o', name: 'outer' }),
            Node(Wrapper, {
              key: 'w',
              children: Div({
                __meo$: 2,
                __meo$s: MISSING,
                id: 'under-component',
                children: [
                  createElement(Labelled, { key: 'a', name: 'a' }),
                  createElement('p', { key: 'b' }, createElement(Labelled, { name: 'b' }), 'x'),
                  createElement(Labelled, { key: 'c', name: 'c' }),
                ],
              } as never),
            }),
          ],
        } as never).render(),
      ),
    )
  }

  it('warns on both sides, hydrates with no mismatch and ids intact', async () => {
    const { __resetThemeDiagnostics } = await import('@src/util/theme-diagnostics.util.js')
    const warnings: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void warnings.push(String(args[0])))

    __resetStaticCss()
    __resetThemeDiagnostics()
    registerTokens()
    NodeUtil.isServer = true
    let html: string
    try {
      html = renderToString(createElement(TokenApp))
    } finally {
      NodeUtil.isServer = false
    }
    const serverWarnings = warnings.splice(0).filter(text => text.includes('--meonode-theme-primary-missing'))
    const serverIds = Object.fromEntries(
      [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('label')].map(label => [label.dataset.probe, label.htmlFor]),
    )

    document.open()
    document.write(html)
    document.close()
    __resetStaticCss()
    __resetThemeDiagnostics()
    registerTokens()
    for (const name of Object.keys(clientIds)) delete clientIds[name]
    const messages: string[] = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void messages.push(args.map(String).join(' ')))
    try {
      await act(async () => {
        hydrateRoot(document, createElement(TokenApp), { onRecoverableError: error => void messages.push(String(error)) })
      })
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }

    expect(serverWarnings).toHaveLength(1)
    expect(warnings.filter(text => text.includes('--meonode-theme-primary-missing'))).toEqual(serverWarnings)
    expect(messages.filter(message => HYDRATION_MARKERS.some(marker => marker.test(message)))).toEqual([])
    expect(Object.keys(serverIds)).toEqual(['outer', 'a', 'b', 'c'])
    expect(clientIds).toEqual(serverIds)
  })
})
