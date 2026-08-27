// @vitest-environment jsdom
//
// Collisions across a component boundary, pinned because they were structural
// for a long time and the fix should not be able to regress quietly.
//
// Memoized subtrees used to live in one global `Map`, keyed by a string built
// from each node's props and its position under the render root. React composes
// what a component returns, so that positional chain restarted at every
// component boundary: two components rendering structurally identical trees
// derived identical keys, shared one entry, and the second rendered the first's
// content.
//
// `@meonode/compiler` narrowed it — `__meo$k` is a source-position hash, so
// distinct *call sites* were distinct by construction — but never closed it. Two
// instances of the *same* component share a source position, so `__meo$k` was
// identical for both and the collision survived a compiled build.
//
// A memoized subtree now renders inside a `MeoMemo` fiber, so identity comes
// from React: there is no string to derive and nothing to collide, for plain
// functions and `Component` alike. Assertions here are behavioural — what each
// case must render — so they outlive the mechanism.
import { render, cleanup } from '@testing-library/react'
import { act, createElement, useState } from 'react'
import { Component, Div } from '@src/main.js'

afterEach(cleanup)

// Plain function components. These have no boundary the library controls, and
// were the case no derived key could ever fix.
const PlainA = () => Div({ children: [Div({ padding: '8px', children: 'AAA' }, [])] }, []).render()
const PlainB = () => Div({ children: [Div({ padding: '8px', children: 'BBB' }, [])] }, []).render()

// Built with the HOC.
const HocA = Component(() => Div({ children: [Div({ padding: '8px', children: 'AAA' }, [])] }, []))
const HocB = Component(() => Div({ children: [Div({ padding: '8px', children: 'BBB' }, [])] }, []))

// One definition, two instances. The differing prop reaches only `children`,
// which every derived signature deliberately excluded.
const Titled = Component<{ title: string }>(props => Div({ children: [Div({ padding: '8px', children: props.title }, [])] }, []))

// Instances differing only *inside* an object prop, which a props hash could not
// see — it hashed objects by key name, never by value.
const Boxed = Component<{ item: { label: string } }>(props => Div({ children: [Div({ padding: '8px', children: props.item.label }, [])] }, []))

const mount = (a: () => unknown, b: () => unknown) => Div({ children: [createElement(a as never), createElement(b as never)] })

describe('cross-component-boundary collisions', () => {
  it('do not occur between two plain function components', () => {
    const { container } = render(mount(PlainA, PlainB).render())

    expect(container.textContent).toBe('AAABBB')
  })

  it('do not occur between two components built with the HOC', () => {
    const { container } = render(Div({ children: [HocA({}), HocB({})] }).render())

    expect(container.textContent).toBe('AAABBB')
  })

  it('do not occur between two instances of one component', () => {
    const { container } = render(Div({ children: [Titled({ title: 'AAA' }), Titled({ title: 'BBB' })] }).render())

    expect(container.textContent).toBe('AAABBB')
  })

  it('do not occur when instances differ only inside an object prop', () => {
    const { container } = render(Div({ children: [Boxed({ item: { label: 'AAA' } }), Boxed({ item: { label: 'BBB' } })] }).render())

    expect(container.textContent).toBe('AAABBB')
  })

  it('do not occur when the props argument is not a literal', () => {
    // The compiler cannot classify a conditional props argument, so it emits no
    // marker at all — this used to collide even in a compiled build. Nothing
    // about the fix depends on the compiler, so it must hold here too.
    const cond = true
    const CondA = () => Div(cond ? { children: [Div({ padding: '8px', children: 'AAA' }, [])] } : { children: [] }, []).render()
    const CondB = () => Div(cond ? { children: [Div({ padding: '8px', children: 'BBB' }, [])] } : { children: [] }, []).render()

    const { container } = render(mount(CondA, CondB).render())

    expect(container.textContent).toBe('AAABBB')
  })
})

describe('memoization survives its own instance re-rendering', () => {
  it('holds a frozen subtree while the parent re-renders with new props', () => {
    // The other half of the contract. A scope derived from props would change
    // as an instance's props change, which both defeats `deps` and strands a
    // memo per distinct props value. Identity does neither: `deps: []` means
    // frozen, whatever the props do.
    let setTick: (n: number) => void = () => {}
    const Harness = () => {
      const [tick, setState] = useState(0)
      setTick = setState
      return Div({ children: [Titled({ title: `t${tick}` })] }).render()
    }

    const { container } = render(createElement(Harness))
    expect(container.textContent).toBe('t0')

    for (let i = 1; i <= 20; i++) act(() => setTick(i))

    expect(container.textContent).toBe('t0')
  })
})
