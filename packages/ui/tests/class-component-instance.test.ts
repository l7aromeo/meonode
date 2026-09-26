import { Component, createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { Div } from '@src/main.js'

afterEach(cleanup)

/** A class component whose instance is passed as a child rather than as an element. */
class Greeting extends Component<{ name: string }> {
  render() {
    return createElement('span', null, `hello ${this.props.name}`)
  }
}

describe('a class component instance as a child', () => {
  it('renders what the instance renders', () => {
    const { container } = render(Div({ children: new Greeting({ name: 'child' }) as never }).render())
    expect(container.textContent).toBe('hello child')
  })

  // A function child reaches the render-prop path as an array member.
  it('renders what an instance returned by a render prop renders', () => {
    const { container } = render(Div({ children: [() => new Greeting({ name: 'render prop' })] as never }).render())
    expect(container.textContent).toBe('hello render prop')
  })
})
