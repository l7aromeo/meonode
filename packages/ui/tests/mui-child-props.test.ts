// @vitest-environment jsdom
//
// MUI components that read their children's props or clone them: `Tabs` takes
// each `Tab`'s `value` and hands it `selected`, `Select` reads each option's
// `value` and children to show the chosen one, and `ToggleButtonGroup` marks the
// buttons whose `value` is selected. Styled MeoNode children must work with them.
import { MenuItem, Select, Tab, Tabs, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { act, createElement, type ReactNode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Div, Node } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
})

function mount(tree: ReactNode) {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => root.render(tree))
  return container
}

const click = (element: Element) => act(() => void (element as HTMLElement).click())

describe('MUI components that read their styled children’s props', () => {
  it('Tabs selects the Tab whose value it holds, and follows a click', () => {
    function App() {
      const [value, setValue] = useState('b')
      return Div({
        padding: 181,
        children: Node(Tabs, {
          value,
          onChange: (_: unknown, next: string) => setValue(next),
          children: ['a', 'b', 'c'].map(name => Node(Tab, { key: name, value: name, label: name, 'data-testid': `tab-${name}`, margin: 182 } as never)),
        }),
      }).render()
    }
    const container = mount(createElement(App))
    const selected = () => [...container.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute('aria-selected'))
    expect(selected()).toEqual(['false', 'true', 'false'])
    click(container.querySelector('[data-testid="tab-c"]') as Element)
    expect(selected()).toEqual(['false', 'false', 'true'])
  })

  it('ToggleButtonGroup marks the buttons whose value it holds, and follows a click', () => {
    function App() {
      const [value, setValue] = useState<string[]>(['left'])
      return Div({
        padding: 183,
        children: Node(ToggleButtonGroup, {
          value,
          onChange: (_: unknown, next: string[]) => setValue(next),
          children: ['left', 'center', 'right'].map(name =>
            Node(ToggleButton, { key: name, value: name, 'data-testid': `toggle-${name}`, margin: 184, children: name } as never),
          ),
        }),
      }).render()
    }
    const container = mount(createElement(App))
    const pressed = () => [...container.querySelectorAll('button')].map(button => button.getAttribute('aria-pressed'))
    expect(pressed()).toEqual(['true', 'false', 'false'])
    click(container.querySelector('[data-testid="toggle-right"]') as Element)
    expect(pressed()).toEqual(['true', 'false', 'true'])
  })

  it('Select shows the children of the option whose value it holds', () => {
    const container = mount(
      Div({
        padding: 185,
        children: Node(Select, {
          value: 'two',
          children: [
            Node(MenuItem, { key: 'one', value: 'one', margin: 186, children: 'First' }),
            Node(MenuItem, { key: 'two', value: 'two', margin: 186, children: 'Second' }),
          ],
        }),
      }).render(),
    )
    expect(container.querySelector('[role="combobox"]')?.textContent).toBe('Second')
  })
})
