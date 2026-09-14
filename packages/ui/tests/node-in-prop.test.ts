// @vitest-environment jsdom
//
// A `BaseNode` handed to a prop rather than to children.
//
// `children` is resolved by the render walk, so a node there becomes an element.
// Nothing resolves a node sitting in any other prop, and what happens next is
// decided by the receiver: a component that renders it makes React throw with
// an internal field dump naming no call site, and a host tag silently stringifies
// it to `[object Object]`. Two of the three outcomes are silent, which is why
// this is caught here rather than left to React.
import { Div, Node, Span } from '@src/main.js'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

const LOC = '__meo$loc'
const HERE = 'app/page.tsx:12:3'

/** The error a render throws, or null. */
function thrownBy(build: () => unknown): string | null {
  try {
    renderToStaticMarkup(build() as never)
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe('a node given to a prop instead of children', () => {
  // Silent today: React writes `title="[object Object]"` and nothing complains.
  it('is caught on a host tag, where React would say nothing at all', () => {
    const message = thrownBy(() => Div({ title: Span('x'), children: 'a', [LOC]: HERE } as never).render())
    expect(message).toContain('[MeoNode]')
    expect(message).toContain('title')
  })

  // Deliberately NOT caught on a component. Handing a node to a component that
  // puts it in its own `children` is a supported pattern, covered by
  // `tests/props-attributes.test.ts`. The receiver decides, and only it knows.
  it('is left alone on a component, where passing a node is a real pattern', () => {
    const Receiver = ({ icon }: { icon?: unknown }) => Div({ children: icon as never }).render()
    expect(thrownBy(() => Node(Receiver, { icon: Span('x'), [LOC]: HERE } as never).render())).toBeNull()
  })

  it('names the call site when the compiler supplied one', () => {
    const message = thrownBy(() => Div({ title: Span('x'), children: 'a', [LOC]: HERE } as never).render())
    expect(message).toContain(HERE)
  })

  it('still explains itself when the compiler supplied no location', () => {
    const message = thrownBy(() => Div({ title: Span('x'), children: 'a' } as never).render())
    expect(message).toContain('[MeoNode]')
    expect(message).toContain('title')
  })

  it('leaves children alone — a node there is the normal case', () => {
    expect(thrownBy(() => Div({ children: [Span('x'), Span('y')] }).render())).toBeNull()
  })

  it('does not fire for ordinary props', () => {
    expect(thrownBy(() => Div({ id: 'x', title: 'hello', padding: 8, children: 'a' }).render())).toBeNull()
  })
})
