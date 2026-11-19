// @vitest-environment jsdom
//
// In development React records, for each element, the component whose render
// created it and the stack it was created at, and its owner stacks, error
// component stacks and warnings name them. Below styled nodes they name the
// author's components.
import { act, captureOwnerStack, Component as ReactComponent, createElement, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Div, Node, P, Span, ThemeProvider } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const provider = (children: unknown) => ThemeProvider({ tokens: {}, modes: ['light'], defaultMode: 'light', children } as never).render() as ReactNode

/** React's console messages, with their `%s` arguments filled in. */
const messages = () => {
  const out: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const [first, ...rest] = args.map(String)
    out.push([(first ?? '').replace(/%s/g, () => rest.shift() ?? ''), ...rest].join(' '))
  })
  return out
}

const mount = (tree: ReactNode) => {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container, { onUncaughtError: () => {}, onCaughtError: () => {} })
  act(() => root.render(tree))
  return container
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('a component below styled nodes, in development', () => {
  it('gets an owner stack that starts at the author’s component', () => {
    let ownerStack = ''
    function Reads() {
      ownerStack = captureOwnerStack() ?? ''
      return null
    }
    function Deep() {
      return Div({ padding: 4, children: Span(Node(Reads), { margin: 5 }) }).render()
    }
    mount(provider(createElement(Deep)))
    const components = [...ownerStack.matchAll(/at ([\w$.]+) \(/g)].map(match => match[1]).filter(name => /^[A-Z]/.test(name) && !name.startsWith('BaseNode'))
    expect(components[0]).toBe('Deep')
  })
})

describe('React’s component stacks below styled nodes, in development', () => {
  it('name the author’s components for an error a boundary catches', () => {
    let componentStack = ''
    class Boundary extends ReactComponent<{ children?: ReactNode }, { failed: boolean }> {
      state = { failed: false }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch(_: unknown, info: { componentStack?: string | null }) {
        componentStack = info.componentStack ?? ''
      }
      render() {
        return this.state.failed ? null : this.props.children
      }
    }
    function Thrower(): never {
      throw new Error('thrown below styled nodes')
    }
    function Row() {
      return Div({ padding: 7, children: Span(Node(Thrower), { margin: 8 }) }).render()
    }
    messages()
    mount(provider(createElement(Boundary, null, createElement(Row))))
    expect(componentStack.match(/\b(Thrower|Row|Boundary)\b/g)).toEqual(['Thrower', 'Row', 'Boundary'])
  })

  it('name the author’s component for invalid nesting', () => {
    const reported = messages()
    function Nest() {
      return P(Div({ padding: 9, children: Span('inner', { margin: 10 }) }), { margin: 11 }).render()
    }
    mount(provider(createElement(Nest)))
    expect(reported.find(message => message.includes('cannot be a descendant of <p>'))).toContain('<Nest>')
  })

  it('name the author’s component for a hydration mismatch', async () => {
    let side = 'server'
    function Mismatch() {
      return Div({ padding: 12, children: Span(Span(side, { margin: 13 }), { margin: 14 }) }).render()
    }
    const container = document.body.appendChild(document.createElement('div'))
    container.innerHTML = renderToString(provider(createElement(Mismatch)))
    side = 'client'
    messages()
    let componentStack = ''
    await act(async () => {
      hydrateRoot(container, provider(createElement(Mismatch)), {
        onRecoverableError: (_: unknown, info: { componentStack?: string }) => void (componentStack += info.componentStack ?? ''),
      })
    })
    expect(componentStack).toContain('Mismatch')
  })
})
