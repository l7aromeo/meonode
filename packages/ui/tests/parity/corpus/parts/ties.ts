// Ties between rules of two nodes at equal specificity that Emotion settles by
// insertion order, one shape per tie-* case. In each, the later-inserted rule
// wins under Emotion; the computed colour of the element both rules reach
// must match extraction off. A css object held in a variable keeps its node
// on the runtime path (runtime:css-not-literal); a literal one is extracted.
import { useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Div, Node, Span } from '@meonode/ui'

/** Rules held in variables, so their nodes stay on the runtime path. */
const reachRed = { '& > *': { color: 'rgb(200, 0, 0)' } }
const ownBlue = { '&.a': { color: 'rgb(0, 0, 200)' } }
const reachAllRed = { '& *': { color: 'rgb(200, 0, 0)' } }

function OwnBlue({ label }: { label: string }): ReactElement {
  return Span(label, { css: { color: 'rgb(0, 0, 200)' } }).render() as ReactElement
}

/** A runtime parent's `& > *` reaches an extracted child with its own colour: the child's rule is inserted later, so the child is blue. */
export function RuntimeReachStaticTarget(): ReactElement {
  return Div({
    key: 'rrst-runtime-parent',
    css: reachRed,
    children: Span('extracted child', { key: 'rrst-reached', css: { color: 'rgb(0, 0, 200)' } }),
  } as never).render() as ReactElement
}

/** The child's class is first inserted by a standalone copy, before the extracted parent that reaches it: the parent's rule is later, so the reached copy is red. */
export function HistoryTarget(): ReactElement {
  return Div({
    children: [
      Node(OwnBlue, { key: 'hist-standalone', label: 'standalone copy' }),
      Div({
        key: 'hist-parent',
        css: { '& > *': { color: 'rgb(200, 0, 0)' } },
        children: Node(OwnBlue, { key: 'hist-reached', label: 'reached after its standalone copy' }),
      }),
    ],
  } as never).render() as ReactElement
}

/** An extracted child's `.a:has(&)` against its runtime ancestor's own `&.a`: the child's rule is later, so the ancestor is red. */
export function LaterHasRuntimeAncestor(): ReactElement {
  return Div({
    key: 'lhas-reached',
    className: 'a',
    css: ownBlue,
    children: Span('sets its ancestor red', { key: 'lhas-has-child', css: { '.a:has(&)': { color: 'rgb(200, 0, 0)' } } }),
  } as never).render() as ReactElement
}

/** A runtime grandparent's `& *` and an extracted parent's `& > *` over a child with no colour: the parent's rule is later, so the child is green. */
export function RuntimeGrandparentStaticParent(): ReactElement {
  return Div({
    key: 'rgsp-runtime-grandparent',
    css: reachAllRed,
    children: Div({ key: 'rgsp-static-parent', css: { '& > *': { color: 'rgb(0, 160, 0)' } }, children: Span('no colour', { key: 'rgsp-reached' }) }),
  } as never).render() as ReactElement
}

function Inner(): ReactElement {
  return Div({
    key: 'nro-inner',
    css: { '& > .t': { color: 'rgb(0, 160, 0)' } },
    children: Span('reached by both', { key: 'nro-reached', className: 't' }),
  }).render() as ReactElement
}

/** An outer extracted node's `& .t`, rendered before a component whose own extracted node's `& > .t` reaches the same element: the inner rule is later, so it is green. */
export function NestedRenderOuterFirst(): ReactElement {
  return Div({
    key: 'nro-outer',
    css: { '& .t': { color: 'rgb(200, 0, 0)' } },
    children: Node(Inner, { key: 'nro-component' }),
  } as never).render() as ReactElement
}

function HasSource(): ReactElement {
  return Span('sets its ancestor red', { key: 'nsrc-has-child', css: { '.a:has(&)': { color: 'rgb(200, 0, 0)' } } }).render() as ReactElement
}

/** An extracted target's own `&.a`, with an extracted `.a:has(&)` source in a component's render under it: the source's rule is later, so the target is red. */
export function NestedSourceUnderTarget(): ReactElement {
  return Div({
    key: 'nsrc-reached',
    className: 'a',
    css: { '&.a': { color: 'rgb(0, 0, 200)' } },
    children: Node(HasSource, { key: 'nsrc-component' }),
  } as never).render() as ReactElement
}

/** Portals `children` into `container` once there is one; the server has none. */
function Portal({ container }: { container: HTMLElement | null }): ReactElement | null {
  return container
    ? createPortal(
        Span('portalled into the reaching node', { key: 'port-reached', className: 't', css: { '&.t': { color: 'rgb(0, 0, 200)' } } }).render() as ReactElement,
        container,
      )
    : null
}

/**
 * A DOM descendant rendered earlier in React order: a portal before the
 * reaching node in the tree puts its target inside that node, in the same
 * commit. The target's rule is inserted first, so the reaching `& .t` wins
 * and the target is red.
 */
export function PortalEarlier(): ReactElement {
  const [container] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')))
  return Div({
    children: [
      Node(Portal, { key: 'port-portal', container } as never),
      Div({
        key: 'port-reacher',
        ref: (node: HTMLElement | null) => {
          if (node && container && container.parentNode !== node) node.append(container)
        },
        css: { '& .t': { color: 'rgb(200, 0, 0)' } },
        children: 'reaching node',
      }),
    ],
  } as never).render() as ReactElement
}
