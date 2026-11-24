// Two named siblings that each follow a component on some render and the
// parent's rule on another. On a render where neither component is there,
// both follow the parent's rule, so their rules go in, in order, with the
// parent's: a, then b. The two rules tie at equal specificity on the target,
// so the later one, b's, decides its colour, as with extraction off.
import { useState, type ReactElement } from 'react'
import { Button, Div, Node, Span } from '@meonode/ui'

function Badge({ label }: { label: string }): ReactElement {
  return Span(label).render() as ReactElement
}

export function ClassOnlyRun(): ReactElement {
  const [shown, setShown] = useState(false)
  return Div({
    children: [
      Button('toggle', { key: 'toggle', type: 'button', 'data-act': 'toggle', onClick: () => setShown(value => !value) }),
      Div({
        key: 'cor-parent',
        className: 'wrapper',
        css: { padding: 2 },
        children: [
          shown && Node(Badge, { key: 'first-badge', label: 'first badge' }),
          Span('a', { key: 'cor-a', css: { '& ~ .t': { color: 'rgb(200, 0, 0)' } } }),
          shown && Node(Badge, { key: 'second-badge', label: 'second badge' }),
          Span('b', { key: 'cor-b', css: { '& ~ .t': { color: 'rgb(0, 0, 200)' } } }),
          Span('target', { key: 'cor-target', className: 't' }),
        ],
      }),
    ],
  } as never).render() as ReactElement
}
