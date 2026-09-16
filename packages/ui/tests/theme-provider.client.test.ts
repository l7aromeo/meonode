import React from 'react'
import { createNode, ThemeProvider, useTheme } from '@src/main.js'
import { cleanup, render } from '@testing-library/react'

const TOKENS = {
  spacing: { md: '16px' },
  colors: { primary: 'rgb(255, 0, 0)' },
}

const NEXT_TOKENS = {
  spacing: { md: '20px' },
  colors: { primary: 'rgb(0, 0, 255)' },
}

const base = (tokens: Record<string, unknown>) => ({ tokens, modes: ['light', 'dark'], defaultMode: 'light' })

/** Reads the mode so the suite has a consumer, as it did before. */
const ModeReader = createNode(function ModeReader() {
  const { mode } = useTheme() as never as { mode: string }
  return React.createElement('span', { 'data-testid': 'mode' }, mode)
})

function getThemeStyleTag(): HTMLStyleElement | null {
  // The tag is rendered by ThemeProvider as part of its own subtree (so it is
  // emitted during SSR and torn down with the provider), rather than being
  // imperatively appended to <head>. CSS is document-global, so `:root` applies
  // either way — query the whole document.
  return document.querySelector('style[data-meonode-theme-vars]')
}

afterEach(() => {
  cleanup()
  document.querySelectorAll('style[data-meonode-theme-vars]').forEach(node => node.remove())
})

describe('ThemeProvider client CSS vars', () => {
  it('injects :root CSS variables from current theme', () => {
    const App = ThemeProvider({ ...base(TOKENS), children: ModeReader({}) } as never)

    render(App.render() as never)

    const themeStyleTag = getThemeStyleTag()
    expect(themeStyleTag).not.toBeNull()
    expect(themeStyleTag?.textContent).toContain(':root{')
    expect(themeStyleTag?.textContent).toContain('--meonode-theme-spacing-md:16px;')
    expect(themeStyleTag?.textContent).toContain('--meonode-theme-colors-primary:rgb(255, 0, 0);')
  })

  it('replaces :root CSS variables when the tokens change', () => {
    // `tokens` is not state — it flows through on every render — so a provider
    // handed a new map rewrites the block. The mode does not do this and must
    // not: the whole design is that the document does not move with it.
    const { rerender } = render(ThemeProvider({ ...base(TOKENS), children: ModeReader({}) } as never).render() as never)
    rerender(ThemeProvider({ ...base(NEXT_TOKENS), children: ModeReader({}) } as never).render() as never)

    const styleTags = document.querySelectorAll('style[data-meonode-theme-vars]')
    expect(styleTags).toHaveLength(1)
    expect(styleTags[0]?.textContent).toContain('--meonode-theme-spacing-md:20px;')
    expect(styleTags[0]?.textContent).toContain('--meonode-theme-colors-primary:rgb(0, 0, 255);')
  })

  it('removes injected theme style tag on unmount', () => {
    const App = ThemeProvider({ ...base(TOKENS), children: ModeReader({}) } as never)

    const { unmount } = render(App.render() as never)
    expect(getThemeStyleTag()).not.toBeNull()

    unmount()

    expect(getThemeStyleTag()).toBeNull()
  })
})
