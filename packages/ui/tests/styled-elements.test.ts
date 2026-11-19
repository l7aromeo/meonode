// @vitest-environment jsdom
//
// On the client a styled element resolves its class where it renders, and its
// rule is inserted by a leaf beside it only while the sheet lacks it. What
// renders matches Emotion's own `css` prop: the classes, the rules and the order
// they are inserted in, which is the order of the tree, also across components
// that render their children later, twice or reordered.
import {
  act,
  Children,
  cloneElement,
  createElement,
  forwardRef,
  Fragment,
  isValidElement,
  memo,
  Profiler,
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tooltip } from '@mui/material'
import { Button, Div, Node, Span, ThemeProvider, useTheme } from '@src/main.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
  document.body.innerHTML = ''
})

function mount(tree: ReactNode) {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => root.render(tree))
  return { container, root }
}

/** The classes in the order their rules were inserted, from the first rule that names each. */
const insertedClasses = (): string[] => {
  const text = [...document.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n')
  return [...new Set([...text.matchAll(/\.(css-[a-z0-9]+)/g)].map(match => match[1]))]
}

/** The classes on the elements in `container`, in document order. */
const classesInTree = (container: Element): string[] => [
  ...new Set([...container.querySelectorAll('*')].flatMap(element => [...element.classList].filter(name => name.startsWith('css-')))),
]

/** Asserts the rules `container` added were inserted in the order of its elements. */
const expectTreeOrder = (before: string[], container: Element) => {
  const added = insertedClasses().filter(name => !before.includes(name))
  expect(added).toEqual(classesInTree(container))
  expect(added.length).toBeGreaterThan(1)
}

const Wrap = ({ children }: { children?: ReactNode }) => createElement('section', null, children)
const Twice = ({ children }: { children?: ReactNode }) => createElement('div', null, children, children)
const Reverse = ({ children }: { children?: ReactNode }) => createElement('div', null, [...(Array.isArray(children) ? children : [children])].reverse())

describe('the rules styled elements insert', () => {
  it('go in in the order of the tree when a component sits between styled elements', () => {
    const before = insertedClasses()
    const { container } = mount(
      Div({
        margin: 101,
        children: [
          Span('a', { key: 'a', margin: 102 }),
          Node(Wrap, { key: 'w', children: [Span('b', { key: 'b', margin: 103 }), Div({ key: 'c', margin: 104, children: Span('d', { margin: 105 }) })] }),
          Span('e', { key: 'e', margin: 106 }),
        ],
      }).render(),
    )
    expectTreeOrder(before, container)
  })

  it('go in in the order of the tree when a component renders its children twice', () => {
    const before = insertedClasses()
    const { container } = mount(
      Div({ margin: 111, children: [Node(Twice, { key: 't', children: Span('x', { margin: 112 }) }), Span('y', { key: 'y', margin: 113 })] }).render(),
    )
    expectTreeOrder(before, container)
  })

  it('go in in the order of the tree when a component reorders its children', () => {
    const before = insertedClasses()
    const { container } = mount(
      Div({
        margin: 121,
        children: [
          Node(Reverse, {
            key: 'r',
            children: [Span('1', { key: '1', margin: 122 }), Span('2', { key: '2', margin: 123 }), Span('3', { key: '3', margin: 124 })],
          }),
          Span('z', { key: 'z', margin: 125 }),
        ],
      }).render(),
    )
    expectTreeOrder(before, container)
  })

  it('go in in the order of the tree after siblings with dependencies, memo and forwardRef', () => {
    const before = insertedClasses()
    const Memoized = memo(() => Span('memo', { margin: 191 }).render())
    const WithRef = forwardRef<HTMLSpanElement>((_, ref) => Span('ref', { ref, margin: 192 }).render())
    const { container } = mount(
      Div({
        margin: 190,
        children: [
          Div({ key: 'deps', margin: 193, children: Span('in deps', { margin: 194 }) }, [1]),
          Span('after deps', { key: 'a', margin: 195 }),
          createElement(Memoized, { key: 'memo' }),
          Span('after memo', { key: 'b', margin: 196 }),
          createElement(WithRef, { key: 'ref' }),
          Span('after ref', { key: 'c', margin: 197 }),
          Div({ key: 'nested', margin: 198, children: createElement(Memoized) }),
          Span('after nested', { key: 'd', margin: 199 }),
        ],
      }).render(),
    )
    expectTreeOrder(before, container)
  })

  it('are in the document when a layout effect below them reads its element', () => {
    const seen: string[] = []
    function Probe() {
      const ref = useRef<HTMLDivElement>(null)
      useLayoutEffect(() => void seen.push(getComputedStyle(ref.current as HTMLDivElement).paddingLeft))
      return Div({ ref, padding: '17px', children: 'p' }).render()
    }
    mount(Div({ margin: 131, children: Node(Probe) }).render())
    expect(seen).toEqual(['17px'])
  })
})

describe('props cloned onto the element a styled root renders', () => {
  it('reach the root element, with a class beside its own', () => {
    const element = Div({ id: 'cloned', padding: 141, children: 'x' }).render()
    const { container } = mount(cloneElement(element as ReactElement<Record<string, unknown>>, { className: 'given', 'data-state': 'on' }))
    const div = container.querySelector('#cloned') as HTMLElement
    expect(div.getAttribute('data-state')).toBe('on')
    expect(div.classList.contains('given')).toBe(true)
    expect([...div.classList].some(name => name.startsWith('css-'))).toBe(true)
  })
})

describe('the children a component is given among styled nodes', () => {
  /** Renders `child` as the only child of a component, and returns what that component was given. */
  const given = (child: unknown): ReactElement<Record<string, unknown>> => {
    let seen: unknown
    const Probe = ({ children }: { children?: ReactNode }) => {
      seen = children
      return createElement('div', null, children)
    }
    mount(Div({ padding: 171, children: Node(Probe, { children: child as never }) }).render())
    expect(isValidElement(seen)).toBe(true)
    return seen as ReactElement<Record<string, unknown>>
  }

  it('are an unstyled component’s own element', () => {
    const Inner = () => createElement('b', null, 'inner')
    expect(given(Node(Inner)).type).toBe(Inner)
  })

  it('are an unstyled host’s own element, with its props', () => {
    const element = given(Span('plain', { title: 'plain title' }))
    expect(element.type).toBe('span')
    expect(element.props.title).toBe('plain title')
  })

  it('carry a styled node’s props, for a component that reads them', () => {
    expect(given(Span('styled', { title: 'styled title', margin: 172 })).props.title).toBe('styled title')
  })

  it('keep a styled child’s own handler when a component that reads it clones it', async () => {
    const calls: string[] = []
    const { container } = mount(
      Div({
        padding: 173,
        children: Node(Tooltip, {
          title: 'tip',
          children: Button('go', { 'data-testid': 'tooltip-child', margin: 174, onMouseOver: () => void calls.push('own') }),
        }),
      }).render(),
    )
    const button = container.querySelector('[data-testid="tooltip-child"]') as HTMLElement
    await act(async () => void button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(calls).toEqual(['own'])
    expect(button.getAttribute('aria-label')).toBe('tip')
  })
})

describe('a styled element rendered before it is placed', () => {
  const themed = (primary: string, children: unknown) =>
    ThemeProvider({ tokens: { colors: { primary } }, modes: ['light'], defaultMode: 'light', children } as never).render() as ReactNode

  // Rendered under one provider and placed under another, it is styled by the
  // provider it renders under, exactly as the same node placed there unrendered.
  it.each([
    ['css that reads a token', { color: 'theme.colors.primary' }],
    ['css that reads none', { color: 'rgb(7, 8, 9)' }],
  ])('with %s has the class and computed style of the node placed unrendered', (_, css) => {
    function Author({ prerendered }: { prerendered: boolean }) {
      const span = Span('x', { id: 'placed', css })
      return themed('rgb(2, 2, 2)', prerendered ? span.render() : span)
    }
    const styleOf = (prerendered: boolean) => {
      const { container, root } = mount(themed('rgb(1, 1, 1)', createElement(Author, { prerendered })))
      const placed = container.querySelector('#placed') as HTMLElement
      const result = { className: placed.className, color: getComputedStyle(placed).color }
      act(() => root.unmount())
      return result
    }
    const inPlace = styleOf(false)
    expect(styleOf(true)).toEqual(inPlace)
    expect(inPlace.color).toBe(css.color === 'theme.colors.primary' ? 'rgb(2, 2, 2)' : 'rgb(7, 8, 9)')
  })
})

describe('a root with no styled node', () => {
  it('renders its own element', () => {
    const element = Div({ id: 'plain', children: Span('x') }).render() as ReactElement
    expect(element.type).toBe('div')
  })
})

describe('styled elements whose css reads the mode', () => {
  it('re-renders for the mode without re-rendering what reads none of it', () => {
    const map = new Map([['theme', 'night']])
    vi.stubGlobal('localStorage', { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) })
    let setMode!: (mode: string) => void
    function Setter() {
      setMode = useTheme().setMode as never
      return null
    }
    const renders: string[] = []
    const Leaf = () => createElement('i', null, 'leaf')
    const tree = ThemeProvider({
      tokens: {},
      modes: ['morning', 'night'],
      defaultMode: 'morning',
      children: [
        createElement(Setter, { key: 'setter' }),
        Div({
          key: 'page',
          children: [
            Div({ key: 'reader', id: 'reader', css: { color: (theme: { mode: string }) => (theme.mode === 'night' ? 'rgb(0, 0, 1)' : 'rgb(0, 0, 2)') } }),
            Div({
              key: 'other',
              margin: 151,
              children: createElement(Profiler, { id: 'other', onRender: (_: string, phase: string) => void renders.push(phase) }, createElement(Leaf)),
            }),
          ],
        }),
      ],
    } as never).render()
    const { container } = mount(tree)
    const classOf = () => (container.querySelector('#reader') as HTMLElement).className
    const night = classOf()
    act(() => setMode('morning'))
    expect(classOf()).not.toBe(night)
    expect(renders).toEqual(['mount'])
  })
})

describe('styled elements whose provider’s tokens change', () => {
  it('styles children it rendered before from the new tokens, beside a node that reads the mode', () => {
    let setTokens!: (tokens: object) => void
    const tokens = { colors: { primary: 'rgb(10, 20, 30)' } }
    function TokenSwitch({ children }: { children?: ReactNode }) {
      const [current, set] = useState<object>(tokens)
      setTokens = set
      return ThemeProvider({ tokens: current, modes: ['morning', 'night'], defaultMode: 'morning', children } as never).render()
    }
    const content = Div({
      children: [
        Span('reader', { key: 'r', css: { color: (theme: { mode: string }) => (theme.mode === 'night' ? 'rgb(0, 0, 1)' : 'rgb(0, 0, 2)') } }),
        Span('keyed', { key: 'k', 'data-testid': 'keyed', css: { '&[data-tone="theme.colors.primary"]': { paddingLeft: 201 } } }),
      ],
    }).render()
    const { container } = mount(createElement(TokenSwitch, null, content))
    const ruleOf = () => {
      const className = [...(container.querySelector('[data-testid="keyed"]') as HTMLElement).classList].find(name => name.startsWith('css-'))
      return [...document.querySelectorAll('style')].map(style => style.textContent ?? '').find(text => text.includes(`.${className}[`))
    }
    expect(ruleOf()).toContain('rgb(10, 20, 30)')
    act(() => setTokens({ colors: { primary: 'rgb(30, 20, 10)' } }))
    expect(ruleOf()).toContain('rgb(30, 20, 10)')
  })
})

describe('children a clone of a styled element gives it', () => {
  it('are rendered in place of the node’s own, as MUI’s SliderValueLabel gives them', () => {
    const Relabel = ({ children }: { children: ReactElement<{ children?: ReactNode }> }) =>
      cloneElement(children, undefined, createElement(Fragment, null, children.props.children, createElement('b', { id: 'added' }, 'added')))
    const { container } = mount(Node(Relabel, { children: Span(Span('own', { id: 'own', margin: 211 }), { id: 'cloned', margin: 212 }) }).render())
    expect(container.querySelector('#cloned #own')?.textContent).toBe('own')
    expect(container.querySelector('#cloned #added')?.textContent).toBe('added')
  })
})

describe('an unstyled root', () => {
  it('keeps its element, and the state below it, when a node deep inside it gains a style', () => {
    let setStyled!: (styled: boolean) => void
    let setText!: (text: string) => void
    function Field() {
      const [text, set] = useState('typed')
      setText = set
      return createElement('input', { id: 'field', value: text, readOnly: true })
    }
    function App() {
      const [styled, set] = useState(false)
      setStyled = set
      return Div({
        children: [Node(Field, { key: 'f' }), Div({ key: 'd', children: Span('deep', { id: 'deep', ...(styled && { marginLeft: 213 }) }) })],
      }).render()
    }
    const { container } = mount(createElement(App))
    const field = container.querySelector('#field') as HTMLInputElement
    act(() => setText('changed'))
    act(() => setStyled(true))
    expect(container.querySelector('#field')).toBe(field)
    expect((container.querySelector('#field') as HTMLInputElement).value).toBe('changed')
    expect(getComputedStyle(container.querySelector('#deep') as HTMLElement).marginLeft).toBe('213px')
  })
})

describe('an unstyled host below a component', () => {
  /** What `Probe` was handed, and what `React.Children` reaches from it: hosts with their own props, and text. */
  const read = (child: unknown) => {
    let seen: ReactElement<{ children?: unknown }> | undefined
    const Probe = ({ children }: { children?: ReactNode }) => {
      seen = children as ReactElement<{ children?: unknown }>
      return createElement('div', null, children)
    }
    mount(Node(Probe, { children: child as never }).render())
    const reached: string[] = []
    const visit = (node: unknown) =>
      Children.forEach(node as ReactNode, item => {
        if (typeof item === 'string') reached.push(item)
        else if (isValidElement<{ children?: unknown; title?: string }>(item)) {
          if (typeof item.type === 'string') reached.push(`${item.type}:${item.props.title ?? ''}`)
          visit(item.props.children)
        }
      })
    visit(seen)
    return { seen: seen as ReactElement<{ children?: unknown }>, reached }
  }

  it('leads React.Children to the hosts and text main renders, with their own props', () => {
    const { reached } = read(
      Div({
        title: 'host',
        children: [
          Span('a', { key: 'a', title: 'a', margin: 215 }),
          Span('b', { key: 'b', title: 'b' }),
          Span(Span('c', { margin: 216 }), { key: 'c', title: 'c' }),
        ],
      }),
    )
    expect(reached).toEqual(['div:host', 'a', 'span:b', 'b', 'span:c', 'c'])
  })
})

describe('styled elements on mount', () => {
  it('runs each theme function once, with the reader’s stored mode', () => {
    const map = new Map([['theme', 'night']])
    vi.stubGlobal('localStorage', { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) })
    const calls: string[] = []
    const byMode = (theme: { mode: string }) => (calls.push(theme.mode), theme.mode === 'night' ? 'rgb(0, 0, 1)' : 'rgb(0, 0, 2)')
    mount(
      ThemeProvider({
        tokens: {},
        modes: ['morning', 'night'],
        defaultMode: 'morning',
        children: Div({ children: [Span('a', { key: 'a', margin: 217, css: { color: byMode } }), Span('b', { key: 'b', css: { color: byMode } })] }),
      } as never).render(),
    )
    expect(calls).toEqual(['night', 'night'])
  })

  it('styles each node from its css as written, before any theme function in the render runs', () => {
    const shared = { color: 'rgb(0, 0, 50)' }
    const { container } = mount(
      ThemeProvider({
        tokens: {},
        modes: ['morning'],
        defaultMode: 'morning',
        children: Div({
          children: [
            Span('mutator', { key: 'm', css: { color: () => ((shared.color = 'rgb(50, 0, 0)'), 'rgb(9, 9, 9)') } }),
            Span('after', { key: 'a', id: 'after', css: shared }),
          ],
        }),
      } as never).render(),
    )
    expect(getComputedStyle(container.querySelector('#after') as HTMLElement).color).toBe('rgb(0, 0, 50)')
  })
})
