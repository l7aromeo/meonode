// @vitest-environment jsdom
//
// Regression coverage for a class of bug that used to be structural.
//
// Memoized subtrees were held in one global `Map`, keyed by a string derived
// from each node's props and its position under the render root. Anything that
// made two different subtrees derive the same string made them share an entry,
// and the second one rendered the first one's content. Three separate ways in:
//
//   - a bug where children of a props-less wrapper were keyed `undefined_0`,
//     so every such wrapper's memoized children collided
//   - two sibling wrappers whose own props matched, since `signature` excluded
//     children by design
//   - two React roots, since the key chain bottomed out at the root and both
//     roots looked like the same position
//
// Memoized subtrees now live in fibers of their own, so identity comes from
// React and there is no string to collide. These are kept as behaviour tests:
// they assert what each case must render, not how it is keyed, so they survive
// the mechanism changing again.
import { render, cleanup } from '@testing-library/react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { Div } from '@src/main.js'

afterEach(cleanup)

describe('memoized subtrees stay distinct', () => {
  it('under two props-less wrappers', () => {
    const wrap = (text: string) => Div({ children: [Div({ padding: '8px', children: text }, [])] })

    const { container } = render(Div({ children: [wrap('AAA'), wrap('BBB')] }).render())

    expect(container.textContent).toBe('AAABBB')
  })

  it('under two sibling wrappers with identical props', () => {
    // The wrappers' own props match exactly; only their children differ, and
    // children were deliberately excluded from the old signature.
    const wrap = (text: string) => Div({ padding: '4px', children: [Div({ padding: '8px', children: text }, [])] })

    const { container } = render(Div({ children: [wrap('AAA'), wrap('BBB')] }).render())

    expect(container.textContent).toBe('AAABBB')
  })

  it('across two React roots holding identical trees', () => {
    const tree = (text: string) => Div({ children: [Div({ padding: '8px', children: text }, [])] })

    const hostA = document.createElement('div')
    const hostB = document.createElement('div')
    document.body.append(hostA, hostB)
    const rootA = createRoot(hostA)
    const rootB = createRoot(hostB)

    act(() => rootA.render(tree('AAA').render()))
    act(() => rootB.render(tree('BBB').render()))

    expect(hostA.textContent).toBe('AAA')
    expect(hostB.textContent).toBe('BBB')

    act(() => {
      rootA.unmount()
      rootB.unmount()
    })
    hostA.remove()
    hostB.remove()
  })
})
