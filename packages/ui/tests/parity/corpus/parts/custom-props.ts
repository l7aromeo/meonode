// Custom properties and var() where only the browser shows the result, for
// the custom-props-* cases: inheritance into children in another module
// (extracted and runtime parents and children), fallbacks, a registered
// non-inheriting property, values that follow state (VAR and SWITCH), a
// property overridden under :hover and @media, an inline style beside
// extracted rules, and a custom property as a node prop outside css, which is
// not a style in either build (it is passed on as a DOM prop, which React
// drops), so the var() reading it has nothing to read.
import { useState, type ReactElement } from 'react'
import { Button, Div, Node, Span } from '@meonode/ui'
import { GapChild, GapChildRuntime, SizeChild } from './custom-props-child.js'

/** The custom properties the cases read on every element. */
export const CUSTOM_PROPS = [
  '--parity-gap',
  '--parity-missing',
  '--parity-size',
  '--parity-step',
  '--parity-switch',
  '--parity-c',
  '--parity-inline',
  '--parity-top',
]

/** The click that changes the state-driven properties. */
export const NEXT_STEP = '[data-act="custom-next"]'

const runtimeParent = { '--parity-gap': '11px' }

export function CustomProps(): ReactElement {
  const [n, setN] = useState(1)
  return Div({
    children: [
      Button('next', { key: 'next', type: 'button', 'data-act': 'custom-next', onClick: () => setN(v => v + 1) }),
      // Inheritance: an extracted parent and a runtime parent, each over an extracted and a runtime child.
      Div({ key: 'gap-parent', css: { '--parity-gap': '6px' }, children: [Node(GapChild, { key: 'a' }), Node(GapChildRuntime, { key: 'b' })] }),
      Div({ key: 'gap-parent-runtime', css: runtimeParent, children: [Node(GapChild, { key: 'a' }), Node(GapChildRuntime, { key: 'b' })] }),
      // Fallbacks: missing, nested missing, and a fallback naming a defined property.
      Div({
        key: 'fallbacks',
        css: {
          '--parity-c': 'rgb(20, 0, 0)',
          marginLeft: 'var(--parity-missing, 4px)',
          marginRight: 'var(--parity-missing, var(--parity-also-missing, 5px))',
          color: 'var(--parity-missing, var(--parity-c))',
        },
        children: 'fallbacks',
      }),
      // A registered non-inheriting length: the child reads its initial value, not the parent's.
      Div({
        key: 'registered',
        css: { '@property --parity-size': { syntax: '"<length>"', inherits: 'false', initialValue: '9px' }, '--parity-size': '40px' },
        children: Node(SizeChild, { key: 'c' }),
      }),
      // Values that follow state: one read at run time, one chosen by a condition.
      Div({
        key: 'dynamic',
        css: {
          '--parity-step': `${n * 2}px`,
          '--parity-switch': n % 2 ? '1px' : '3px',
          paddingTop: 'var(--parity-step)',
          outlineOffset: 'var(--parity-switch)',
        },
        children: Span('dynamic child', { key: 's', css: { paddingBottom: 'var(--parity-step)' } }),
      }),
      // Overridden under :hover and in @media.
      Div({
        key: 'overrides',
        css: {
          '--parity-c': 'rgb(1, 0, 0)',
          color: 'var(--parity-c)',
          '&:hover': { '--parity-c': 'rgb(2, 0, 0)' },
          '@media (min-width: 600px)': { '--parity-c': 'rgb(3, 0, 0)' },
        },
        children: Span('inherits the colour', { key: 's' }),
      }),
      // A user's inline custom property beside an extracted rule setting the same one.
      Div({ key: 'inline', style: { '--parity-inline': '7px' }, css: { '--parity-inline': '1px', paddingTop: 'var(--parity-inline)' }, children: 'inline' }),
      // A custom property as a node prop, outside css: a DOM prop, not a style.
      Div({ key: 'top-level', '--parity-top': '8px', paddingBottom: 'var(--parity-top)', children: 'top-level prop' }),
    ],
  } as never).render() as ReactElement
}
