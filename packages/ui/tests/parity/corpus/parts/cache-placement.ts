// Where extracted rules go against a page's own stylesheet and against runtime
// rules, under the default Emotion cache and under one with an
// `insertionPoint`, for the cache-default-* and cache-insertion-point-* cases
// (prepend is prepend-cache). A host of class `card` has an extracted padding
// tied with the page's `.card { padding: 0 }`. After a click, which comes after
// hydration, an extracted child is reached by a runtime parent that mounts then,
// and a node with an extracted padding gains a runtime one: each runtime rule
// is inserted last, so it wins under Emotion.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { useState, type ReactElement } from 'react'
import { Button, Div, Node, Span } from '@meonode/ui'

/** The page's own stylesheet, tied with the extracted padding. */
export const CARD_PAGE_CSS = '.card{padding:0;border:1px solid rgb(0, 0, 0)}'

/** The click that mounts the runtime parent. */
export const MOUNT_PARENT = '[data-act="mount-parent"]'

/** A rule held in a variable, so its node stays on the runtime path. */
const reachRed = { '& > *': { color: 'rgb(200, 0, 0)' } }

function Shapes({ label }: { label: string }): ReactElement {
  const [mounted, setMounted] = useState(false)
  const child = Span(`extracted child (${label})`, { key: 'cache-child', css: { color: 'rgb(0, 0, 200)' } })
  return Div({
    children: [
      Div({ key: 'cache-card', className: 'card', padding: 16, children: `card (${label})` }),
      Button('mount parent', { key: 'mount', type: 'button', 'data-act': 'mount-parent', onClick: () => setMounted(true) }),
      mounted ? Div({ key: 'cache-parent', css: reachRed, children: child }) : Div({ key: 'cache-holder', children: child }),
      // One Emotion class with extraction off: the props' padding, then the css one.
      Div({ key: 'cache-tie', padding: 16, css: { padding: mounted ? 8 : undefined }, children: `padding then a runtime padding (${label})` }),
    ],
  } as never).render() as ReactElement
}

/** Under the default cache: no provider. */
export function DefaultCache(): ReactElement {
  return Node(Shapes, { label: 'default cache' }).render() as ReactElement
}

/**
 * The insertion point MUI's docs set up, a `<meta name="emotion-insertion-point">`
 * at the head's start, made in the browser before the cache is: Emotion's rules
 * go right after it, before the page's stylesheet. The server has no document,
 * so the point is unset there and Emotion writes its styles in place.
 */
function insertionPoint(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  let point = document.head.querySelector<HTMLMetaElement>('meta[name="emotion-insertion-point"]')
  if (!point) {
    point = document.createElement('meta')
    point.name = 'emotion-insertion-point'
    point.content = ''
    document.head.prepend(point)
  }
  return point
}

const pointed = createCache({ key: 'ip', insertionPoint: insertionPoint() })

export function InsertionPointCache(): ReactElement {
  return Node(CacheProvider, { value: pointed, children: Node(Shapes, { label: 'insertion point' }) }).render() as ReactElement
}
