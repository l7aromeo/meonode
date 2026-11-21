// @vitest-environment jsdom
//
// Where an app's extracted rules land against its other styles, through the
// public surface only: a compiled module registers, a compiled node renders
// under the Emotion cache the app provides. The static rules must sit where the
// same node's rules would uncompiled: right before that cache's tags, in that
// cache's container.
import { CacheProvider } from '@emotion/react'
import createCache, { type EmotionCache } from '@emotion/cache'
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, registerStaticCss } from '@src/main.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PADDING = 'mn-0000000000p16'
const RULE = `.${PADDING}{padding:16px;}`

const register = () => registerStaticCss('placement', [[0, PADDING, RULE]])

let roots: Root[] = []

function mount(cache: EmotionCache, ...children: ReactElement[]) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(createElement(CacheProvider, { value: cache }, ...children)))
}

/** A compiled node with only extracted styles, and one whose css stays on the runtime path. */
const extracted = () => Div({ __meo$: 2, __meo$s: PADDING, key: 'static', className: 'card' } as never).render() as ReactElement
const runtime = () => Div({ key: 'runtime', css: { margin: 3 } }).render() as ReactElement

/** The head's children, named by what they are. */
const order = (root: ParentNode = document.head) =>
  [...root.children]
    .map(element =>
      element.hasAttribute('data-meonode-static') ? 'static' : element.getAttribute('data-emotion') || element.getAttribute('data-name') || element.tagName,
    )
    .filter((name, index, names) => name !== names[index - 1])

/** Whether a container holds the static rule. */
const holdsRule = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLStyleElement>('style[data-meonode-static]')].some(element =>
    [...(element.sheet?.cssRules ?? [])].some(rule => rule.cssText.includes(PADDING)),
  )

function userStyle() {
  const element = document.createElement('style')
  element.setAttribute('data-name', 'user')
  element.textContent = '.card{padding:0}'
  document.head.append(element)
}

beforeEach(() => {
  __resetStaticCss()
  document.head.innerHTML = ''
})
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
})

describe('under a cache that prepends, as MUI’s injectFirst does', () => {
  // Uncompiled, the node's rule is in the prepended cache, ahead of the page's
  // stylesheet, which wins a tie. Extracted, it must be ahead of it too.
  it('lands ahead of the page’s styles when the module registers before Emotion inserts anything', () => {
    userStyle()
    register()
    mount(createCache({ key: 'css', prepend: true }), extracted(), runtime())

    expect(order()).toEqual(['static', 'css', 'user'])
  })

  it('lands ahead of the page’s styles when Emotion inserted first', () => {
    userStyle()
    const cache = createCache({ key: 'css', prepend: true })
    mount(cache, runtime())
    register()
    mount(cache, extracted())

    expect(order()).toEqual(['static', 'css', 'user'])
  })
})

// Another library's prepended cache ahead of MeoNode's own, which appends.
it('lands before MeoNode’s cache, not before another library’s', () => {
  const mui = createCache({ key: 'mui', prepend: true })
  mui.sheet.insert('.mui-a{color:red}')
  userStyle()
  register()
  mount(createCache({ key: 'meonode-css' }), extracted(), runtime())

  expect(order()).toEqual(['mui', 'user', 'static', 'meonode-css'])
})

describe('under a cache whose container is not the document head', () => {
  it('lands in a shadow root the cache inserts into', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    register()
    mount(createCache({ key: 'css', container: shadow as unknown as Node }), extracted())

    expect(holdsRule(shadow)).toBe(true)
  })

  it('lands in another document’s head the cache inserts into', () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const frameDocument = frame.contentDocument!
    register()
    mount(createCache({ key: 'css', container: frameDocument.head }), extracted())

    expect(holdsRule(frameDocument.head)).toBe(true)
  })
})
