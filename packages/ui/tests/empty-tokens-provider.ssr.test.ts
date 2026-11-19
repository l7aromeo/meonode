// @vitest-environment node
//
// The server render of empty-tokens-provider.test.ts: a ThemeProvider with no
// tokens yet runs the theme functions below it; with no provider they are
// dropped and reported, as before.
import { renderToString } from 'react-dom/server'
import { Div, ThemeProvider } from '@src/main.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'

afterEach(() => {
  vi.restoreAllMocks()
  __resetThemeDiagnostics()
})

const NO_PROVIDER = 'no ThemeProvider is above this node'

const element = (n: number) =>
  Div({
    css: {
      color: (theme: { mode: string }) => (theme.mode === 'dark' ? 'white' : 'black'),
      paddingTop: () => n,
      '& > span': () => ({ marginTop: n }),
    } as never,
    children: 'x',
  })

it('runs the theme functions under a provider with no tokens, with its theme', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const html = renderToString(ThemeProvider({ tokens: {}, modes: ['light', 'dark'], defaultMode: 'dark', children: element(81) }).render())
  expect(html).toContain('padding-top:81px;')
  expect(html).toContain('margin-top:81px;')
  expect(html).toContain('color:white;')
  expect(warn.mock.calls.flat().join(' ')).not.toContain(NO_PROVIDER)
})

it('still drops and reports them with no provider', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const html = renderToString(element(82).render())
  expect(html).not.toContain('padding-top:82px')
  expect(html).not.toContain('margin-top:82px')
  expect(warn.mock.calls.flat().join(' ')).toContain(NO_PROVIDER)
})
