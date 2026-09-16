// @vitest-environment node
//
// The seeding path reads `data-theme` off the document element, and on the
// server there is no document. `useState` initialisers run there too, so the
// read has to be conditional rather than merely late.
import { renderToString } from 'react-dom/server'
import { createNode, Div, ThemeModesProvider, ThemeProvider, useTheme, type Theme } from '@src/main.js'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

const TOKENS = { colors: { primary: 'var(--brand-primary)' }, spacing: { md: '16px' } }

const page = (overrides: Record<string, unknown> = {}) =>
  ThemeModesProvider({
    tokens: TOKENS,
    modes: ['morning', 'night'],
    defaultMode: 'morning',
    children: Div({ id: 'h', color: 'theme.colors.primary', children: 'x' }),
    ...overrides,
  } as never).render() as never

const PreferenceLabel = createNode(function PreferenceLabel() {
  const { preference } = useTheme() as never as { preference?: string }
  return createElement('span', { id: 'pref' }, String(preference))
})

describe('the mode path with no document', () => {
  it('renders the declared default preference, not the default mode', () => {
    // The server has no storage and no attribute, so the only thing it can say
    // is what the application declared — and it has to say that, because the
    // client's first render says the same and React compares them. Seeding from
    // `defaultMode` instead is invisible once adoption has run, which is why
    // this case is here and not in the client suite.
    const html = renderToString(
      ThemeModesProvider({
        tokens: TOKENS,
        modes: ['morning', 'night'],
        defaultMode: 'morning',
        defaultPreference: 'system',
        system: { light: 'morning', dark: 'night' },
        children: PreferenceLabel({}),
      } as never).render() as never,
    )
    expect(html).toContain('<span id="pref">system</span>')
  })

  it('renders without touching one', () => {
    expect(typeof document).toBe('undefined')
    expect(() => renderToString(page())).not.toThrow()
  })

  it('emits the variable block and resolves tokens against it', () => {
    const html = renderToString(page())
    expect(html).toContain('--meonode-theme-colors-primary:var(--brand-primary);')
    expect(html).toContain('var(--meonode-theme-colors-primary)')
  })

  it('does not stamp a mode into the markup, which is what lets one document serve everyone', () => {
    const html = renderToString(page())
    // The mode lives in `data-theme` on the document element, written by the
    // pre-paint script — never in what the server sent.
    expect(html).not.toContain('data-theme')
    expect(html).not.toContain('morning')
    expect(html).not.toContain('night')
  })

  it('renders the same bytes whichever mode the application defaults to', () => {
    // Not the whole-document claim — that needs the RSC suite — but the part
    // this provider is responsible for: its own output does not move with the
    // mode it was handed.
    expect(renderToString(page({ defaultMode: 'night' }))).toBe(renderToString(page({ defaultMode: 'morning' })))
  })

  it('still renders the legacy theme path server-side', () => {
    const html = renderToString(
      ThemeProvider({ theme: { mode: 'dark', system: TOKENS } as Theme, children: Div({ id: 'h', children: 'x' }) }).render() as never,
    )
    expect(html).toContain('--meonode-theme-spacing-md:16px;')
  })
})
