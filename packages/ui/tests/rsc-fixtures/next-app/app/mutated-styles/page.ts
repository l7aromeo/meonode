import { Div } from '@meonode/ui'

// Module-level style objects a server component changes in place on every request,
// which a cache keyed on the object rather than its contents would serve stale.
const top = { color: 'rgb(0, 0, 1)' }
const topToken = { color: 'theme.primary' }
const nested = { '@media (min-width: 1px)': { color: 'rgb(0, 0, 1)' } }
const nestedToken = { '@media (min-width: 1px)': { color: 'theme.primary' } }
const props: Record<string, unknown> = { 'data-testid': 'props', paddingLeft: 1 }
const propsToken: Record<string, unknown> = { 'data-testid': 'props-token', borderColor: 'theme.primary', borderStyle: 'solid' }

export default async function MutatedStylesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams).error === '1'
  top.color = error ? 'rgb(200, 0, 1)' : 'rgb(0, 0, 1)'
  topToken.color = error ? 'theme.base.default' : 'theme.primary'
  nested['@media (min-width: 1px)'].color = error ? 'rgb(200, 0, 2)' : 'rgb(0, 0, 1)'
  nestedToken['@media (min-width: 1px)'].color = error ? 'theme.base.default' : 'theme.primary'
  props.paddingLeft = error ? 9 : 1
  propsToken.borderColor = error ? 'theme.base.default' : 'theme.primary'
  return Div({
    'data-testid': 'mutated-styles-page',
    children: [
      Div({ key: 'a', 'data-testid': 'top', css: top }),
      Div({ key: 'b', 'data-testid': 'top-token', css: topToken }),
      Div({ key: 'c', 'data-testid': 'nested', css: nested }),
      Div({ key: 'd', 'data-testid': 'nested-token', css: nestedToken }),
      Div({ key: 'e', ...props }),
      Div({ key: 'f', ...propsToken }),
    ],
  }).render()
}
