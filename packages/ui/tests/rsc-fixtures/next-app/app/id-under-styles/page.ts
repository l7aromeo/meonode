'use client'
import { createElement, memo, type ReactNode, Suspense, use } from 'react'
import { MenuItem, Select, Tab, Tabs, TextField, Tooltip } from '@mui/material'
import { Div, Node, Span } from '@meonode/ui'
import { IdProbe } from '../_components/hoc-client'

const Wrap = ({ children }: { children?: ReactNode }) => createElement('section', null, children)
const Memoized = memo(() => Span('memo', { margin: '1px' }).render())

/** Pending on the server for a moment, so the boundary below streams in after the shell. */
const serverDelay = typeof window === 'undefined' ? new Promise<void>(resolve => setTimeout(resolve, 150)) : null
function Streamed() {
  if (serverDelay) use(serverDelay)
  return Div({ padding: '8px', children: [Span('streamed', { margin: '9px' }), Node(IdProbe, { name: 'streamed' })] }).render()
}

// `useId` probes in every place a styled element can sit relative to a client
// component: below styled nodes, after a component or a memo among styled
// siblings, beside a styled sibling in an unstyled root, below a component's host
// child, after MUI components that take ids of their own, and in a streamed boundary.
export default function Page() {
  return Div({
    'data-testid': 'id-under-styles-page',
    children: [
      Div({ key: 'nested', padding: '1px', children: Div({ margin: '2px', children: Node(IdProbe, { name: 'nested' }) }) }),
      Div({
        key: 'after-component',
        padding: '3px',
        children: [Node(Wrap, { key: 'w', children: Span('in wrap', { margin: '4px' }) }), Node(IdProbe, { key: 'p', name: 'after-component' })],
      }),
      Div({ key: 'after-memo', padding: '5px', children: [createElement(Memoized, { key: 'm' }), Node(IdProbe, { key: 'p', name: 'after-memo' })] }),
      Span('styled sibling', { key: 's', margin: '6px' }),
      Node(IdProbe, { key: 'beside', name: 'beside-styled' }),
      Node(Wrap, { key: 'under', children: Div({ children: [Span('a', { key: 'a', margin: '7px' }), Node(IdProbe, { key: 'p', name: 'under-component' })] }) }),
      Div({
        key: 'mui',
        padding: '10px',
        children: [
          Node(TextField, { key: 'tf', label: 'Name', defaultValue: 'x' }),
          Node(Select, {
            key: 'sel',
            value: 'a',
            children: [Node(MenuItem, { key: 'a', value: 'a', margin: '11px', children: 'A' }), Node(MenuItem, { key: 'b', value: 'b', children: 'B' })],
          }),
          Node(Tooltip, { key: 'tip', title: 'tip', children: Span('tip', { margin: '12px' }) }),
          Node(Tabs, { key: 'tabs', value: 'one', children: ['one', 'two'].map(v => Node(Tab, { key: v, value: v, label: v, margin: '13px' })) }),
          Node(IdProbe, { key: 'p', name: 'after-mui' }),
        ],
      }),
      createElement(Suspense, { key: 'streamed', fallback: null }, createElement(Streamed)),
    ],
  }).render()
}
