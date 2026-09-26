import { Component, createElement, type ReactElement, type ReactNode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { Div, Node } from '@src/main.js'

afterEach(cleanup)

// A render prop as the whole `children` of a plain HTML tag is resolved like one
// inside a children array: a tag cannot call it, and React rejects a function there.
// A component can call it, so a component receives it unchanged.
describe('a render prop as the only child', () => {
  it('renders its result inside a host element', () => {
    const { container } = render(Div({ children: () => 'from a render prop' }).render())
    expect(container.innerHTML).toBe('<div>from a render prop</div>')
  })

  it('renders the same as the same render prop inside a children array', () => {
    const bare = render(Div({ children: () => createElement('b', null, 'x') }).render()).container.innerHTML
    cleanup()
    const listed = render(Div({ children: [() => createElement('b', null, 'x')] }).render()).container.innerHTML
    expect(bare).toBe(listed)
  })

  it('is passed through unchanged to a component, which calls it itself', () => {
    const Consumer = ({ children }: { children: (value: string) => ReactNode }) => createElement('p', null, children('supplied by the component'))
    const { container } = render(Node(Consumer, { children: (value: string) => value }).render())
    expect(container.innerHTML).toBe('<p>supplied by the component</p>')
  })

  // Only a render prop is resolved. A class component type is not a function to
  // call, so it reaches React exactly as written.
  it('leaves a class component type given as the only child untouched', () => {
    class Widget extends Component {
      render() {
        return null
      }
    }
    const element = Div({ children: Widget as never }).render() as ReactElement<{ children: unknown }>
    expect(element.props.children).toBe(Widget)
  })
})
