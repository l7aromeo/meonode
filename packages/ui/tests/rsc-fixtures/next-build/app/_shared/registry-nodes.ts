'use client'
import { Div } from '@meonode/ui'

// Styled nodes rendered inside a client component. Their rules reach the page
// only through `StyleRegistry`'s emotion cache, whatever the server-component
// path does, so the pages built from these measure the registry's flush alone.

/** #35's reproduction: an intrinsic node with a nested selector. */
export function Reproduction() {
  return Div({ children: 'Hello', padding: 16, color: 'rebeccapurple', css: { '&:hover': { color: 'crimson' } } }).render()
}

/** Four rules, one of them with a nested selector. */
export function FourRules() {
  return Div({
    children: [
      Div({ key: 1, color: '#1b4332', padding: 4, children: 'one' }),
      Div({ key: 2, color: '#2d6a4f', margin: 2, children: 'two' }),
      Div({ key: 3, color: '#40916c', css: { '&:hover': { color: '#52b788' } }, children: 'three' }),
      Div({ key: 4, color: '#74c69d', borderRadius: 4, children: 'four' }),
    ],
  }).render()
}

const PAIRS = {
  a: [
    ['#0f5132', 'emotion a one'],
    ['#664d03', 'emotion a two'],
  ],
  b: [
    ['#842029', 'emotion b one'],
    ['#055160', 'emotion b two'],
  ],
} as const

const twoRules = (page: keyof typeof PAIRS) =>
  Div({ children: PAIRS[page].map(([color, text], i) => Div({ key: i, color, padding: 4, children: text })) }).render()

/** Two rules, distinct per page, so each response's rules can be attributed. */
export function TwoRulesA() {
  return twoRules('a')
}

/** `TwoRulesA`'s pair, with rules of its own. */
export function TwoRulesB() {
  return twoRules('b')
}
