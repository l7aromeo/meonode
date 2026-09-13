// @vitest-environment jsdom
//
// React matches unkeyed children by position, so deleting or reordering a list
// hands each surviving row the previous row's fiber — its state, its focus, its
// uncommitted input. `For` exists to take the identity from the data instead,
// so callers get correct behaviour without threading `key` through every row.
//
// Every assertion below is stated as "which row kept which state", because that
// is the only thing position-matching gets wrong; the markup looks right either
// way, which is what makes the bug hard to see.
import { Div, Component, For } from '@src/main.js'
import { cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'

afterEach(cleanup)

const Row = Component<{ id: string }>(({ id }) => {
  const [n, setN] = useState(0)
  return Div({ 'data-testid': `row-${id}`, children: `${id}=${n}`, onClick: () => setN(x => x + 1) })
})

/** Clicks a=1, b=2, c=3 so each row's state is distinguishable, then applies the change. */
function exercise(App: (p: { on: boolean }) => never) {
  const view = render(App({ on: true }))
  const clicks: Record<string, number> = { a: 1, b: 2, c: 3 }
  for (const id of ['a', 'b', 'c']) for (let i = 0; i < clicks[id]; i++) view.getByTestId(`row-${id}`).click()
  view.rerender(App({ on: true }))
  const before = view.container.textContent
  view.rerender(App({ on: false }))
  return { before, after: view.container.textContent }
}

describe('For', () => {
  // Stable references are the ordinary case: rows come from state and survive
  // between renders.
  const A = { id: 'a' },
    B = { id: 'b' },
    C = { id: 'c' }

  it('keeps each row its own state when one is deleted', () => {
    const App = ({ on }: { on: boolean }) => Div({ children: For(on ? [A, B, C] : [A, C], item => Row({ id: item.id })) }).render() as never
    expect(exercise(App)).toEqual({ before: 'a=1b=2c=3', after: 'a=1c=3' })
  })

  it('keeps each row its own state when the list is reordered', () => {
    const App = ({ on }: { on: boolean }) => Div({ children: For(on ? [A, B, C] : [C, B, A], item => Row({ id: item.id })) }).render() as never
    expect(exercise(App)).toEqual({ before: 'a=1b=2c=3', after: 'c=3b=2a=1' })
  })

  it('identifies primitive items by their value', () => {
    const App = ({ on }: { on: boolean }) => Div({ children: For(on ? ['a', 'b', 'c'] : ['a', 'c'], id => Row({ id })) }).render() as never
    expect(exercise(App)).toEqual({ before: 'a=1b=2c=3', after: 'a=1c=3' })
  })

  // The documented escape hatch, and the only thing that works when the items
  // themselves are rebuilt between renders.
  it('uses an identity accessor when items are rebuilt each render', () => {
    const App = ({ on }: { on: boolean }) =>
      Div({
        children: For(
          (on ? ['a', 'b', 'c'] : ['a', 'c']).map(id => ({ id })),
          item => Row({ id: item.id }),
          item => item.id,
        ),
      }).render() as never
    expect(exercise(App)).toEqual({ before: 'a=1b=2c=3', after: 'a=1c=3' })
  })

  // Reference identity survives the row's contents changing, which content
  // hashing cannot: renaming a row must not throw away what the user typed.
  it('keeps state when an item is mutated rather than replaced', () => {
    const item = { id: 'a', label: 'first' }
    const Labelled = Component<{ label: string }>(({ label }) => {
      const [n, setN] = useState(0)
      return Div({ 'data-testid': 'only', children: `${label}:${n}`, onClick: () => setN(x => x + 1) })
    })
    const App = ({ on }: { on: boolean }) => {
      item.label = on ? 'first' : 'renamed'
      return Div({ children: For([item], i => Labelled({ label: i.label })) }).render() as never
    }
    const view = render(App({ on: true }))
    view.getByTestId('only').click()
    view.getByTestId('only').click()
    view.rerender(App({ on: true }))
    expect(view.container.textContent).toBe('first:2')
    view.rerender(App({ on: false }))
    expect(view.container.textContent).toBe('renamed:2')
  })

  // Two rows can legitimately be indistinguishable. React needs unique keys, so
  // repeats fall back to their position — no worse than an unkeyed list.
  it('does not collide when two items are identical', () => {
    const messages: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => messages.push(a.map(String).join(' ')))
    const same = { id: 'x' }
    const view = render(Div({ children: For([same, same, same], (_i, index) => Row({ id: ['a', 'b', 'c'][index] })) }).render() as never)
    spy.mockRestore()
    expect(messages.filter(m => /unique "key"/i.test(m))).toEqual([])
    expect(view.container.textContent).toBe('a=0b=0c=0')
  })

  // On mount every object is new, which says nothing at all. Only a *second*
  // render with an entirely new set proves the references cannot be matched.
  it('stays silent on the first render, when every object is new for good reason', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const App = () => Div({ children: For([{ id: 'a' }, { id: 'b' }], item => Row({ id: item.id })) }).render() as never
    render(App())
    expect(warn.mock.calls.filter(c => String(c[0]).includes('identity accessor'))).toEqual([])
    warn.mockRestore()
  })

  it('warns once when items are rebuilt on every render and no identity was given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const App = () => Div({ children: For([{ id: 'a' }, { id: 'b' }], item => Row({ id: item.id })) }).render() as never
    const view = render(App())
    view.rerender(App())
    view.rerender(App())
    const hits = warn.mock.calls.filter(c => String(c[0]).includes('identity accessor'))
    expect(hits.length).toBe(1)
    warn.mockRestore()
  })

  it('never warns for a list whose items keep their identity', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const App = () => Div({ children: For([A, B, C], item => Row({ id: item.id })) }).render() as never
    const view = render(App())
    view.rerender(App())
    view.rerender(App())
    expect(warn.mock.calls.filter(c => String(c[0]).includes('identity accessor'))).toEqual([])
    warn.mockRestore()
  })

  // The key is applied by `For` itself; it is handed to the callback so a row can
  // reuse it — for a nested list, a test id, or a data attribute.
  it('passes the item, its index and the key it was given', () => {
    const calls: Array<[unknown, number, string]> = []
    render(
      Div({
        children: For([A, B], (item, index, key) => {
          calls.push([item, index, key])
          return Div({ children: item.id })
        }),
      }).render() as never,
    )
    expect(calls.map(c => c[0])).toEqual([A, B])
    expect(calls.map(c => c[1])).toEqual([0, 1])
    expect(calls.map(c => c[2])).toHaveLength(2)
    expect(new Set(calls.map(c => c[2])).size).toBe(2)
  })

  it('uses the identity accessor result as the key it reports', () => {
    const keys: string[] = []
    render(
      Div({
        children: For(
          [{ id: 'x' }, { id: 'y' }],
          (item, _index, key) => {
            keys.push(key)
            return Div({ children: item.id })
          },
          item => item.id,
        ),
      }).render() as never,
    )
    expect(keys).toEqual(['x', 'y'])
  })

  it('renders plain factory nodes, not only Component nodes', () => {
    const view = render(Div({ children: For([A, B], item => Div({ 'data-testid': `f-${item.id}`, children: item.id })) }).render() as never)
    expect(view.getByTestId('f-a').textContent).toBe('a')
    expect(view.getByTestId('f-b').textContent).toBe('b')
  })
})
