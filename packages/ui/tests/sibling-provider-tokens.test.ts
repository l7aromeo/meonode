// @vitest-environment jsdom
import { Activity, Div, ThemeProvider, setDebugMode } from '@src/main.js'
import { __resetThemeDiagnostics, trackProviderVars } from '@src/util/theme-diagnostics.util.js'
import { StrictMode, act, createElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Every ThemeProvider declares its tokens on `:root`, so two that are mounted at
 * once share a token they both define even when neither is inside the other.
 * These tests pin when development reports that, and when it stays quiet.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A provider defining only `primary`, with a child that shows which one it is. */
const provider = (primary: string, key?: string, children: ReactNode = Div({ children: primary }).render()) =>
  ThemeProvider({ key, tokens: { primary: { default: primary } } as never, modes: ['light'], defaultMode: 'light', children }).render()

const captured: string[] = []
const originalWarn = console.warn
let root: Root
let host: HTMLElement

beforeEach(() => {
  __resetThemeDiagnostics()
  setDebugMode(true)
  captured.length = 0
  console.warn = (...args: unknown[]) => captured.push(String(args[0]))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  console.warn = originalWarn
  setDebugMode(false)
})

const render = (node: ReactNode) => act(() => root.render(node))
const warnings = () => captured.filter(message => message.includes('theme.primary'))
const siblings = (...nodes: ReactNode[]) => Div({ children: nodes }).render()

describe('ThemeProviders mounted side by side', () => {
  it('warns when two give a token different values', () => {
    render(siblings(provider('red', 'a'), provider('blue', 'b')))
    expect(warnings()).toEqual([expect.stringContaining('Two mounted ThemeProviders give theme.primary the values "red" and "blue"')])
  })

  it('stays quiet when two give a token one value', () => {
    render(siblings(provider('red', 'a'), provider('red', 'b')))
    expect(warnings()).toEqual([])
  })

  it('stays quiet when one replaces the other in a single commit', () => {
    render(provider('red', 'a'))
    render(provider('blue', 'b'))
    expect(warnings()).toEqual([])
  })

  it('stays quiet when one mounts after the other has unmounted', () => {
    render(provider('red', 'a'))
    render(Div({ children: 'none' }).render())
    render(provider('blue', 'b'))
    expect(warnings()).toEqual([])
  })

  it('warns when a conditional one mounts beside another', () => {
    render(siblings(provider('red', 'a')))
    expect(warnings()).toEqual([])
    render(siblings(provider('red', 'a'), provider('blue', 'b')))
    expect(warnings()).toHaveLength(1)
  })

  it('warns when one already mounted changes a token to another value than its sibling', () => {
    render(siblings(provider('red', 'a'), provider('red', 'b')))
    render(siblings(provider('red', 'a'), provider('blue', 'b')))
    expect(warnings()).toHaveLength(1)
  })

  it('stays quiet when a lone provider changes a token', () => {
    render(provider('red', 'a'))
    render(provider('blue', 'a'))
    expect(warnings()).toEqual([])
  })

  it('stays quiet under StrictMode, which mounts each provider twice', () => {
    render(createElement(StrictMode, null, siblings(provider('red', 'a'), provider('red', 'b'))))
    expect(warnings()).toEqual([])
  })

  it('reports a nested redefinition once, with the nested message', () => {
    render(provider('red', 'a', provider('blue', 'b')))
    expect(warnings()).toEqual([expect.stringContaining('A nested ThemeProvider gives theme.primary')])
  })

  it('stays quiet in production', () => {
    setDebugMode(false)
    vi.stubEnv('NODE_ENV', 'production')
    __resetThemeDiagnostics()
    try {
      render(siblings(provider('red', 'a'), provider('blue', 'b')))
      expect(warnings()).toEqual([])
    } finally {
      vi.unstubAllEnvs()
      __resetThemeDiagnostics()
    }
  })

  // A hidden Activity keeps its subtree, tokens included, but runs none of its
  // effects, so a provider inside it is only checked once it is shown.
  it('reports a provider inside a hidden Activity only when the Activity is shown', () => {
    const page = (mode: 'hidden' | 'visible') => siblings(provider('red', 'a'), Activity({ key: 'h', mode, children: provider('blue', 'b') }).render())
    render(page('hidden'))
    expect(warnings()).toEqual([])
    render(page('visible'))
    expect(warnings()).toHaveLength(1)
  })

  // A provider portalled into an iframe declares its tokens on the iframe's own
  // `:root`, so nothing is shared, but the record of mounted providers is per
  // module, not per document, and it is reported all the same.
  it('reports a provider portalled into an iframe, whose document is separate', () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const frameBody = frame.contentDocument!.body
    render(siblings(provider('red', 'a'), createPortal(provider('blue', 'b'), frameBody, 'frame')))
    expect(warnings()).toHaveLength(1)
    act(() => root.render(null))
    frame.remove()
  })
})

describe('__resetThemeDiagnostics', () => {
  it('forgets providers a test left mounted', () => {
    trackProviderVars({}, new Map([['--meonode-theme-primary', 'red']]))
    __resetThemeDiagnostics()
    trackProviderVars({}, new Map([['--meonode-theme-primary', 'blue']]))
    expect(warnings()).toEqual([])
  })
})
