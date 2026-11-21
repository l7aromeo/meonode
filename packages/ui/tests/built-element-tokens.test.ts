// @vitest-environment jsdom
//
// A built element's props are final: a node passing it on leaves its attributes
// and its key as written. Token conversion belongs to style values, so a token in
// its inline `style` still becomes a CSS variable.
import { Div, Span } from '@src/main.js'
import { createElement, type ReactElement } from 'react'

const Icon = (_: { color?: string }) => null
import { expect, it } from 'vitest'

const TOKEN = 'see theme.colors.primary'

/** The element a node hands React for its only child. */
const childOf = (child: unknown) =>
  (Div({ children: child as never }).render() as unknown as { props: { children: ReactElement<Record<string, unknown>> } }).props.children

it('leaves an attribute as written', () => {
  expect(childOf(createElement('a', { title: TOKEN, href: '#' }, 'x')).props.title).toBe(TOKEN)
})

it('leaves an attribute as written on an element holding a node', () => {
  expect(childOf(createElement('a', { title: TOKEN, href: '#' }, Span('x') as never)).props.title).toBe(TOKEN)
})

it('leaves the key as written', () => {
  expect(childOf(createElement('a', { key: 'theme.colors.primary' }, 'x')).key).toBe('theme.colors.primary')
})

it('leaves the key as written on an element holding a node', () => {
  expect(childOf(createElement('a', { key: 'theme.colors.primary' }, Span('x') as never)).key).toBe('theme.colors.primary')
})

it('still converts a token in the inline style', () => {
  const style = childOf(createElement('a', { style: { color: 'theme.colors.primary' } }, 'x')).props.style
  expect(style).toEqual({ color: 'var(--meonode-theme-colors-primary)' })
})

it('still converts a token in the inline style on an element holding a node', () => {
  const style = childOf(createElement('a', { style: { color: 'theme.colors.primary' } }, Span('x') as never)).props.style
  expect(style).toEqual({ color: 'var(--meonode-theme-colors-primary)' })
})

it('leaves the key of a component element as written', () => {
  expect(childOf(createElement(Icon, { key: 'theme.colors.primary', color: 'red' })).key).toBe('theme.colors.primary')
})

// A component may take a style value under any name.
it('still converts a token in a component element prop', () => {
  expect(childOf(createElement(Icon, { color: 'theme.colors.primary' })).props.color).toBe('var(--meonode-theme-colors-primary)')
})
