// @vitest-environment jsdom
//
// Where an app's named rules land against its other styles, through the public
// surface only: a compiled module registers, a compiled node renders under the
// Emotion cache the app provides. A named rule goes in through that cache, so it
// must sit where the same node's rule would uncompiled: in that cache's tags, in
// that cache's container.
import { serializeStyles } from '@emotion/serialize'
import { CacheProvider } from '@emotion/react'
import createCache, { type EmotionCache } from '@emotion/cache'
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, registerStaticCss } from '@src/main.js'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { nameStyles } from '@src/util/style-name.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { name: PADDING, styles: PADDING_STYLES } = nameStyles(serializeStyles([{ padding: '16px' }] as never))

const register = () => registerStaticCss('placement', [[PADDING, PADDING_STYLES]])

let roots: Root[] = []

function mount(cache: EmotionCache, ...children: (() => ReactElement)[]) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(
      createElement(
        CacheProvider,
        { value: cache },
        ...children.map((child, index) =>
          createElement(
            function Page() {
              return child()
            },
            { key: index },
          ),
        ),
      ),
    ),
  )
}

/** A compiled node with its whole style named, and one whose css stays on the runtime path. */
const named = () => Div({ __meo$: 2, __meo$n: PADDING, className: 'card' } as never).render() as ReactElement
const runtime = () => Div({ css: { margin: 3 } }).render() as ReactElement

/** The head's children, named by what they are: the cache whose rule each holds, or the page's own. */
const order = (root: ParentNode = document.head) =>
  [...root.children]
    .map(element => element.getAttribute('data-emotion')?.split(' ')[0] || element.getAttribute('data-name') || element.tagName)
    .filter((name, index, names) => name !== names[index - 1])

/** The cache key of the tag in `root` that holds the named rule, if any. */
const ruleHolder = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLStyleElement>('style[data-emotion]')]
    .find(element => [...(element.sheet?.cssRules ?? [])].some(rule => rule.cssText.includes(PADDING)) || element.textContent?.includes(PADDING))
    ?.getAttribute('data-emotion')
    ?.split(' ')[0]

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
  // stylesheet, which wins a tie. Named, it must be ahead of it too.
  it('lands in the cache, ahead of the page’s styles, when the module registers before Emotion inserts anything', () => {
    userStyle()
    register()
    mount(createCache({ key: 'css', prepend: true }), named, runtime)

    expect(ruleHolder(document.head)).toBe('css')
    expect(order()).toEqual(['css', 'user'])
  })

  it('lands in the cache, ahead of the page’s styles, when Emotion inserted first', () => {
    userStyle()
    const cache = createCache({ key: 'css', prepend: true })
    mount(cache, runtime)
    register()
    mount(cache, named)

    expect(ruleHolder(document.head)).toBe('css')
    expect(order()).toEqual(['css', 'user'])
  })
})

// Another library's prepended cache ahead of MeoNode's own, which appends.
it('lands in MeoNode’s cache, not in another library’s', () => {
  const mui = createCache({ key: 'mui', prepend: true })
  mui.sheet.insert('.mui-a{color:red}')
  userStyle()
  register()
  mount(createCache({ key: 'meonode-css' }), named, runtime)

  expect(ruleHolder(document.head)).toBe('meonode-css')
  expect(order()).toEqual(['mui', 'user', 'meonode-css'])
})

describe('under a cache whose container is not the document head', () => {
  it('lands in a shadow root the cache inserts into', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    register()
    mount(createCache({ key: 'css', container: shadow as unknown as Node }), named)

    expect(ruleHolder(shadow)).toBe('css')
    expect(ruleHolder(document.head)).toBeUndefined()
  })

  it('lands in another document’s head the cache inserts into', () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const frameDocument = frame.contentDocument!
    register()
    mount(createCache({ key: 'css', container: frameDocument.head }), named)

    expect(ruleHolder(frameDocument.head)).toBe('css')
    expect(ruleHolder(document.head)).toBeUndefined()
  })
})
