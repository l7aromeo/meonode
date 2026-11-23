// Identity pages: a runtime-styled sibling (`rule`) toggled, reordered or listed
// before a named node (keyed `x-<page>`, called `x` below). Where no rule is guaranteed before `x`, the compiler
// marks it a carrier (`__meo$r: 1`, or `r: 1` on a factory site). The carrier
// renders through StyledRenderer in every state. Without the mark, the runtime
// makes `x` a carrier only in the states with no rule before it. Its element
// type then changes when `rule` comes or goes, so React remounts `x` and its
// subtree. Styles and DOM are the same either way; only identity differs.
//
// Probe: `x` holds an uncontrolled input. Type into it, then toggle; its value
// survives only if `x` was kept. The controls come after the walk, outside it,
// so they add no rule before `x`.
import { createElement, useState, type ReactElement } from 'react'
import { Button, Div, Input, Node, Span } from '@meonode/ui'
import { F } from './identity-nodes.js'

export const PROBE = '[data-probe="x"]'
export const TOGGLE = '[data-act="toggle"]'

const probe = () => Input({ key: 'p', 'data-probe': 'x', defaultValue: '' })
const rule = (c: string) => Div({ key: 'rule', css: { color: c }, children: 'rule' })
const controls = (flip: () => void) => Button('toggle', { key: 'toggle', type: 'button', 'data-act': 'toggle', onClick: flip })

/** An optional runtime-styled sibling before a named host node. */
export function HostToggle(): ReactElement {
  const [a, setA] = useState(true)
  const [c, setC] = useState('red')
  return Div({
    key: 'page',
    children: [
      Div({ key: 'walk', children: [a ? rule(c) : null, Div({ key: 'x-host-toggle', padding: 8, children: probe() })] }),
      controls(() => {
        setA(v => !v)
        setC(v => (v === 'red' ? 'blue' : 'red'))
      }),
    ],
  }).render()
}

/** The same before a joined factory call. */
export function FactoryToggle(): ReactElement {
  const [a, setA] = useState(true)
  const [c, setC] = useState('red')
  return Div({
    key: 'page',
    children: [
      Div({ key: 'walk', children: [a ? rule(c) : null, F({ key: 'x-factory-toggle', padding: 8, children: probe() })] }),
      controls(() => {
        setA(v => !v)
        setC(v => (v === 'red' ? 'blue' : 'red'))
      }),
    ],
  }).render()
}

/** The runtime-styled sibling moved from before the named node to after it. */
export function HostReorder(): ReactElement {
  const [a, setA] = useState(true)
  const x = Div({ key: 'x-host-reorder', padding: 8, children: probe() })
  return Div({
    key: 'page',
    children: [Div({ key: 'walk', children: a ? [rule('red'), x] : [x, rule('red')] }), controls(() => setA(v => !v))],
  }).render()
}

/** A list of runtime-styled items before the named node, going from one item to none and back. */
export function HostList(): ReactElement {
  const [items, setItems] = useState(['a'])
  const [c, setC] = useState('red')
  return Div({
    key: 'page',
    children: [
      Div({
        key: 'walk',
        children: [items.map(k => Div({ key: k, css: { color: c }, children: k })), Div({ key: 'x-host-list', padding: 8, children: probe() })],
      }),
      controls(() => {
        setItems(v => (v.length ? [] : ['a']))
        setC(v => (v === 'red' ? 'blue' : 'red'))
      }),
    ],
  }).render()
}

/** A plain component, so the node after it has no rule from it. */
const Card = () => createElement('aside', null, 'card')

/** A list of components, two or none, before the named node, under a host with a rule. */
export function FooterWalk(): ReactElement {
  const [a, setA] = useState(true)
  const items = a ? [0, 1] : []
  return Div({
    key: 'page',
    children: [
      Div({ key: 'walk', padding: 1, children: [...items.map(i => Node(Card, { key: i })), Span(probe(), { key: 'x-footer', color: 'red' })] }),
      controls(() => setA(v => !v)),
    ],
  }).render()
}

/** An exported helper whose root is the named node, returned as a node, not rendered. */
export function part() {
  return Span(probe(), { key: 'x-helper', color: 'red' })
}

/** A component present on some renders only, before an exported helper's root. */
export function HelperWalk(): ReactElement {
  const [a, setA] = useState(true)
  return Div({
    key: 'page',
    children: [Div({ key: 'walk', padding: 1, children: [a ? Node(Card, { key: 'k' }) : null, part()] }), controls(() => setA(v => !v))],
  }).render()
}
