// @vitest-environment jsdom
//
// A ThemeProvider with no tokens yet is a provider all the same: the theme
// functions below it run with its theme, and the report that no provider is
// above a node stays silent. With truly no provider they are still dropped and
// reported. The server render is covered in empty-tokens-provider.ssr.test.ts.
import { Div, ThemeProvider } from '@src/main.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'
import { cleanup, render } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  __resetThemeDiagnostics()
})

const NO_PROVIDER = 'no ThemeProvider is above this node'

/** Theme functions for a value and for a whole style, each giving its own lengths. */
const element = (n: number) =>
  Div({
    css: {
      color: (theme: { mode: string }) => (theme.mode === 'dark' ? 'white' : 'black'),
      paddingTop: () => n,
      '& > span': () => ({ marginTop: n }),
    } as never,
    children: 'x',
  })

/** Every rule Emotion has written to the document. */
const rules = () => [...document.head.querySelectorAll('style')].map(s => s.textContent).join('')

it('runs the theme functions under a provider with no tokens, with its theme', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  render(ThemeProvider({ tokens: {}, modes: ['light', 'dark'], defaultMode: 'dark', children: element(71) }).render())
  expect(rules()).toContain('padding-top:71px;')
  expect(rules()).toContain('margin-top:71px;')
  expect(rules()).toContain('color:white;')
  expect(warn.mock.calls.flat().join(' ')).not.toContain(NO_PROVIDER)
})

it('still drops and reports them with no provider', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  render(element(72).render())
  expect(rules()).not.toContain('padding-top:72px')
  expect(rules()).not.toContain('margin-top:72px')
  expect(warn.mock.calls.flat().join(' ')).toContain(NO_PROVIDER)
})
