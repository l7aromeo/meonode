// @vitest-environment jsdom
import { Activity, Div, ThemeProvider } from '@src/main.js'
import { StrictMode, act, createElement, useLayoutEffect, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * A provider declares its tokens in a `<style>` on `:root`, which applies to the whole
 * page wherever the element sits, even hidden with `display: none`. Next.js keeps the
 * previous route mounted inside a hidden Activity, so a provider there must stop
 * declaring its tokens while hidden, or its values override the visible route's.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const provider = (accent: string, children: ReactNode = Div({ children: accent }).render()) =>
  ThemeProvider({ tokens: { accent: { default: accent } } as never, modes: ['light'], defaultMode: 'light', children }).render()

const inActivity = (mode: 'visible' | 'hidden', node: ReactNode, key = 'a') => Activity({ key, mode, children: node }).render()

let root: Root
let host: HTMLElement
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (node: ReactNode) => act(() => root.render(node))

/** Each theme-variables block in the document: its text, and whether its rules apply. */
const blocks = () =>
  [...document.querySelectorAll<HTMLStyleElement>('style[data-meonode-theme-vars]')].map(style => ({
    css: style.textContent,
    applies: !style.sheet || style.sheet.media.mediaText !== 'not all',
  }))

describe('a ThemeProvider inside a hidden Activity', () => {
  it('stops declaring its tokens', () => {
    render(inActivity('hidden', provider('red')))
    expect(blocks()).toEqual([{ css: expect.stringContaining('red'), applies: false }])
  })

  it('declares them again once the Activity is shown', () => {
    render(inActivity('hidden', provider('red')))
    render(inActivity('visible', provider('red')))
    expect(blocks()).toEqual([{ css: expect.stringContaining('red'), applies: true }])
  })

  it('stops declaring them when a shown Activity is hidden, as on a route change', () => {
    render(inActivity('visible', provider('red')))
    expect(blocks()).toEqual([{ css: expect.stringContaining('red'), applies: true }])
    render(inActivity('hidden', provider('red')))
    expect(blocks()).toEqual([{ css: expect.stringContaining('red'), applies: false }])
  })

  it('leaves only the visible route declaring when two routes swap', () => {
    const routes = (shown: 'a' | 'b') =>
      Div({
        children: [
          inActivity(shown === 'a' ? 'visible' : 'hidden', provider('red'), 'a'),
          inActivity(shown === 'b' ? 'visible' : 'hidden', provider('green'), 'b'),
        ],
      }).render()
    for (const shown of ['a', 'b', 'a', 'b'] as const) {
      render(routes(shown))
      expect(blocks().filter(block => block.applies)).toEqual([{ css: expect.stringContaining(shown === 'a' ? 'red' : 'green'), applies: true }])
    }
  })

  it('keeps tokens changed while hidden, and declares the new ones when shown', () => {
    render(inActivity('hidden', provider('red')))
    render(inActivity('hidden', provider('blue')))
    render(inActivity('visible', provider('blue')))
    expect(blocks()).toEqual([{ css: expect.stringContaining('blue'), applies: true }])
  })

  it('hides a nested provider along with the outer one', () => {
    render(
      inActivity(
        'hidden',
        provider('red', ThemeProvider({ tokens: { inner: { default: 'blue' } } as never, modes: ['light'], defaultMode: 'light', children: 'x' }).render()),
      ),
    )
    expect(blocks().map(block => block.applies)).toEqual([false, false])
  })

  it('declares under StrictMode, which runs effects twice', () => {
    render(createElement(StrictMode, null, inActivity('visible', provider('red'))))
    expect(blocks()).toEqual([{ css: expect.stringContaining('red'), applies: true }])
  })
})

describe('a ThemeProvider outside any hidden Activity', () => {
  it('declares its tokens', () => {
    render(provider('red'))
    expect(blocks()).toEqual([{ css: expect.stringContaining('red'), applies: true }])
  })

  it('renders the same markup on the server, with no media attribute', () => {
    expect(renderToString(provider('red'))).toContain('<style data-meonode-theme-vars="">')
  })
})

describe('the server-rendered block', () => {
  it('is adopted at hydration as it is, and goes on declaring the tokens', () => {
    act(() => root.unmount())
    host.innerHTML = renderToString(provider('red'))
    const errors: unknown[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => errors.push(args[0])
    try {
      act(() => {
        root = hydrateRoot(host, provider('red'))
      })
    } finally {
      console.error = originalError
    }
    expect(errors).toEqual([])
    expect(host.querySelector('style[data-meonode-theme-vars]')).toBe(document.querySelector('style[data-meonode-theme-vars]'))
    expect(blocks()).toEqual([{ css: expect.stringContaining('red'), applies: true }])
  })
})

describe('showing and hiding a provider', () => {
  // A layout effect later in the commit may measure the page, and React renders an
  // update inside a hidden Activity late, after the browser may have painted, so the
  // block must be on, or off, by the end of the commit that shows or hides it.
  it('switches the block on and off within the commit that shows or hides it', () => {
    let seen: string | null = 'unread'
    const Observer = ({ mode }: { mode: 'visible' | 'hidden' }) => {
      useLayoutEffect(() => {
        seen = document.querySelector('style[data-meonode-theme-vars]')!.getAttribute('media')
      }, [mode])
      return inActivity(mode, provider('red'))
    }
    render(createElement(Observer, { mode: 'visible' }))
    expect(seen).toBe(null)
    render(createElement(Observer, { mode: 'hidden' }))
    expect(seen).toBe('not all')
  })
})
