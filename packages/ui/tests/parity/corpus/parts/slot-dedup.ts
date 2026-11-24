// Pages on which every named node's server style is already written when the
// node renders: Emotion writes each rule once per server cache, so a named
// node whose style an earlier node wrote has no inline <style> of its own.
// The client must still render the tree the server did. A useId consumer
// under the last node shows it: its id comes from its place in the tree, so
// a fork shows as a hydration error or an id that differs from extraction
// off.
//
// Without a cache provider, Emotion's server render gives each sibling its own
// cache, so a sibling writes its style again; under a provided cache that
// writes in place, the style is written once per page. Each shape runs both
// ways, except the nested one, whose parent hands its cache down either way.
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { createElement, Fragment, useId, type ComponentType, type ReactElement } from 'react'
import { Div, Node } from '@meonode/ui'

/**
 * Its own id, as text, in a fixed-width font so two ids of one length take the
 * same width in every engine. A plain element with an inline style: a style
 * rule of its own would give the page a fresh server style, and so a marker.
 */
function IdText(): ReactElement {
  return createElement('span', { style: { fontFamily: 'monospace' } }, `id ${useId()}`)
}

const id = () => Node(IdText, { key: 'id' })

/** A rule held in a variable, so its node stays on the runtime path. */
const runtimePadding = { padding: 2 }

/** Two named siblings with one style; the second holds the id. */
export function Siblings(): ReactElement {
  return Div({
    children: [Div({ key: 'sib-a', padding: 2, children: 'first' }), Div({ key: 'sib-b', padding: 2, children: id() })],
  } as never).render() as ReactElement
}

/** A named node inside a named node with the same style, holding the id. */
export function Nested(): ReactElement {
  return Div({ key: 'nest-outer', padding: 2, children: Div({ key: 'nest-inner', padding: 2, children: id() }) }).render() as ReactElement
}

/** A runtime node, then a named node with the same css, holding the id. */
export function RuntimeThenNamed(): ReactElement {
  return Div({
    children: [Div({ key: 'rt-runtime', css: runtimePadding, children: 'runtime' }), Div({ key: 'rt-named', padding: 2, children: id() })],
  } as never).render() as ReactElement
}

/** Two roots with no parent between them, one style in both; the second holds the id. */
export function TwoRoots(): ReactElement {
  return createElement(
    Fragment,
    null,
    Div({ key: 'root-a', padding: 2, children: 'first root' }).render() as ReactElement,
    Div({ key: 'root-b', padding: 2, children: id() }).render() as ReactElement,
  )
}

/**
 * A cache of the page's own, which writes its styles in place on the server,
 * under Emotion's default key, so a runtime node and a named node with the
 * same css share one class and one rule.
 */
const provided = createCache({ key: 'css' })

/** The shape under the provided cache. */
const underCache = (Shape: ComponentType) =>
  function Provided(): ReactElement {
    return Node(CacheProvider, { value: provided, children: Node(Shape) }).render() as ReactElement
  }

export const SiblingsProvided = underCache(Siblings)
export const RuntimeThenNamedProvided = underCache(RuntimeThenNamed)
export const TwoRootsProvided = underCache(TwoRoots)
