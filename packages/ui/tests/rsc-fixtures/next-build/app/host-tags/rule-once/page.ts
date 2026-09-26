import { Div } from '@meonode/ui'

const STYLED = { color: 'rgb(34, 56, 78)', padding: '2px 5px' }

/**
 * One rule used three times: by a render prop's result, which renders in its own
 * `.render()` call, and by two siblings, each beside a different class the rule
 * did not come from.
 */
export default function Page() {
  return Div({
    children: [
      Div({
        key: 'render-prop',
        children: () => Div({ 'data-testid': 'from-render-prop', className: 'utility-a', css: STYLED, children: 'from a render prop' }),
      }),
      Div({ key: 'a', 'data-testid': 'sibling-a', className: 'utility-a', css: STYLED, children: 'a' }),
      Div({ key: 'b', 'data-testid': 'sibling-b', className: 'utility-b', css: STYLED, children: 'b' }),
    ],
  }).render()
}
