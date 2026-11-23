// Dynamics: a key present then absent, a keyed list reordered, a keyed
// remount, a deps memo node, styles from context, a transition update, and a
// css object mutated in place between renders.
import { createContext, startTransition, useContext, useState, type ReactElement } from 'react'
import { Button, Div, Li, Node, Ul } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: [
    'dyn.key-toggle',
    'dyn.list-reorder',
    'dyn.keyed-remount',
    'dyn.deps-memo',
    'dyn.context',
    'dyn.transition',
    'dyn.mutated-object',
    'dyn.state',
    'env.ssr-hydrate',
  ],
  routes: ['CARRIER', 'RUNTIME:css-not-literal', 'RUNTIME:dynamic-value', 'RUNTIME:not-extractable', 'RUNTIME:props-spread'],
  routing: [
    { node: 'memo', route: 'CARRIER' },
    { node: 'toggle', route: 'RUNTIME:props-spread' },
    { node: 'mutated', route: 'RUNTIME:css-not-literal' },
  ],
  steps: [
    { name: 'advance 1', click: '[data-act="next"]' },
    { name: 'advance 2', click: '[data-act="next"]' },
    { name: 'advance 3', click: '[data-act="next"]' },
  ],
}

const Accent = createContext('rgb(0, 0, 0)')

function Themed(): ReactElement {
  return Div({ color: useContext(Accent), children: 'from context' }).render() as ReactElement
}

/** Mutated in place on every render, as some apps do with a shared object. */
const shared = { borderWidth: 1, borderStyle: 'solid' }

export function App(): ReactElement {
  const [step, setStep] = useState(0)
  const order = step % 2 === 0 ? ['a', 'b', 'c'] : ['c', 'a', 'b']
  shared.borderWidth = step + 1
  return Div({
    padding: 4,
    children: [
      Button('next', { key: 'next', type: 'button', 'data-act': 'next', onClick: () => startTransition(() => setStep(s => s + 1)) }),
      Div({
        key: 'toggle',
        ...(step % 2 === 1 ? { backgroundColor: 'rgb(255, 255, 0)' } : {}),
        css: step % 2 === 1 ? { color: 'rgb(0, 0, 200)' } : {},
        children: 'toggled key',
      }),
      Ul({
        key: 'list',
        children: order.map(id => Li({ key: id, color: id === 'a' ? 'rgb(200, 0, 0)' : 'rgb(0, 0, 0)', paddingLeft: id === 'c' ? 8 : 2, children: id })),
      }),
      Div({ key: `remount-${step}`, marginTop: step, children: 'remounted' }),
      Div({ key: 'memo', fontWeight: step > 1 ? 700 : 400, children: 'memo' }, [step > 1]),
      Node(Accent.Provider, { key: 'ctx', value: step > 0 ? 'rgb(0, 120, 0)' : 'rgb(0, 0, 0)', children: Node(Themed) }),
      Div({ key: 'mutated', css: shared, children: 'mutated' }),
    ],
  } as never).render() as ReactElement
}
