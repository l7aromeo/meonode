// A deps argument that is not an array (#149): development builds report it
// with console.error, naming the factory and its signature, for every entry
// point that takes deps, once per distinct message. Nothing throws and nothing
// else changes; production builds make no check.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshDevMode } from '@src/constant/common.const.js'
import { Component, createChildrenFirstNode, createNode, Li, Node, Span } from '@src/main.js'
import { __depsReportState, __resetDepsReport } from '@src/util/factory-check.util.js'

let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  __resetDepsReport()
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  error.mockRestore()
  vi.unstubAllEnvs()
  refreshDevMode()
})

const Section = createNode('section')
const Em = createChildrenFirstNode('em')
const Card = Component<{ title?: string }>(function Card(props) {
  return Span(props.title ?? 'card')
})

/** Each entry point that takes deps, called with something other than an array where its deps go, and how the message names it. */
const WRONG_CALLS: Array<[entry: string, call: () => unknown, named: string]> = [
  // The call in #149: a children-first habit on a props-first factory puts the props in deps.
  ['a props-first factory', () => Li('x' as never, { key: 'a' } as never), "The 'li' factory takes (props, deps)"],
  ['a children-first factory', () => Span('x', { key: 'a' }, { key: 'b' } as never), "The 'span' factory takes (children, props, deps)"],
  ['Node', () => Node('div', { key: 'a' }, { key: 'b' } as never), 'Node takes (element, props, deps)'],
  ['a Component callable', () => Card({ title: 't' }, { key: 'b' } as never), 'Component(Card) takes (props, deps)'],
  ['a createNode factory', () => Section({ key: 'a' }, 7 as never), "The 'section' factory takes (props, deps)"],
  ['a createChildrenFirstNode factory', () => Em('x', { key: 'a' }, 'deps' as never), "The 'em' factory takes (children, props, deps)"],
]

describe('a deps argument that is not an array', () => {
  it.each(WRONG_CALLS)('is reported in development for %s, naming its signature', (_, call, named) => {
    expect(call).not.toThrow()
    expect(error).toHaveBeenCalledTimes(1)
    const message = String(error.mock.calls[0][0])
    expect(message).toMatch(/^\[MeoNode\] deps must be an array, but was given an? \w+\./)
    expect(message).toContain(named)
  })

  it('names what it was given', () => {
    Li('x' as never, { key: 'a' } as never)
    Section({}, 7 as never)
    Em('x', {}, 'deps' as never)
    // Falsy, but still not a list. Another factory than the 7 above, whose message is the same and logged once.
    Li({}, 0 as never)
    expect(error.mock.calls.map((call: unknown[]) => String(call[0]).match(/was given (an? \w+)\./)?.[1])).toEqual([
      'an object',
      'a number',
      'a string',
      'a number',
    ])
  })

  it.each(WRONG_CALLS)('is not checked in production for %s', (_, call) => {
    vi.stubEnv('NODE_ENV', 'production')
    refreshDevMode()
    expect(call).not.toThrow()
    expect(error).not.toHaveBeenCalled()
  })

  it('names a function component that only looks like a Component renderer as Node', () => {
    // A Component callable is recognised by the renderer it made, not by a display name anyone can give.
    function Lookalike() {
      return null
    }
    Lookalike.displayName = 'Renderer(Card)'
    Node(Lookalike, {}, { key: 'b' } as never)
    expect(String(error.mock.calls[0][0])).toContain('Node takes (element, props, deps)')
  })

  it('reports nothing for array, omitted or null deps', () => {
    Li({ key: 'a', children: 'x' }, ['dep'])
    Li({ key: 'a', children: 'x' })
    Li({ key: 'a', children: 'x' }, null as never)
    Span('x', { key: 'a' }, [1, 2])
    Node('div', {}, [])
    Card({ title: 't' }, ['t'])
    expect(error).not.toHaveBeenCalled()
  })
})

describe('repeated reports', () => {
  it('reports the same call once, however often it runs', () => {
    // A component calls its factories again on every render.
    const render = () => Li('x' as never, { key: 'a' } as never)
    for (let i = 0; i < 20; i++) render()
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('reports each distinct message once: another factory, or another kind of value', () => {
    for (let i = 0; i < 3; i++) {
      Li('x' as never, { key: 'a' } as never)
      Li('x' as never, 7 as never)
      Section({}, { key: 'a' } as never)
    }
    expect(error).toHaveBeenCalledTimes(3)
  })

  it('never remembers more messages than the cap, and reports again once it has dropped them', () => {
    // A long-lived development server sees factories for every element and component it renders.
    const cap = __depsReportState().cap
    let most = 0
    for (let i = 0; i < cap * 2 + 1; i++) {
      createNode(`x-element-${i}` as 'div')({}, { key: 'a' } as never)
      most = Math.max(most, __depsReportState().reported)
    }
    expect(most).toBe(cap)
    expect(error).toHaveBeenCalledTimes(cap * 2 + 1)

    const first = () => createNode('x-element-0' as 'div')({}, { key: 'a' } as never)
    first()
    expect(error).toHaveBeenCalledTimes(cap * 2 + 2)
    first()
    expect(error).toHaveBeenCalledTimes(cap * 2 + 2)
  })
})
