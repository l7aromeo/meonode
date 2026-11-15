// @vitest-environment jsdom
//
// A css theme function (`theme => …`) needs a theme to run with. In a client
// element with no ThemeProvider above it there is none, and the warning says so.
// The server-component case, where a provider may well be above, is pinned in
// tests/react-server-layer.test.ts.
import { Div } from '@src/main.js'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const warnings: string[] = []

beforeEach(() => {
  __resetThemeDiagnostics()
  warnings.length = 0
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void warnings.push(String(args[0])))
})

afterEach(() => vi.restoreAllMocks())

describe('a theme function dropped in a client element', () => {
  it('names the missing ThemeProvider', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    await act(async () => createRoot(container).render(Div({ css: { color: theme => String(theme.mode) }, children: 'x' }).render()))
    container.remove()
    const dropped = warnings.filter(w => w.includes('theme function'))
    expect(dropped).toHaveLength(1)
    expect(dropped[0]).toContain('for `color`')
    expect(dropped[0]).toContain('no ThemeProvider is above this node')
  })
})
