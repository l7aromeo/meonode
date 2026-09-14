/**
 * Compile-time verification that `children` accepts the nested form.
 * Run: bunx tsc --noEmit (included in project lint).
 *
 * Nesting shipped in 2.2.0 as a runtime change and `Children` was never widened
 * with it, so the released types rejected the shape the release documents while
 * still accepting the spread it exists to replace. Every test that covered the
 * feature was a runtime test, and a runtime test cannot fail on this: the cases
 * are written in JavaScript, which has no opinion about the annotation. That is
 * the whole reason it shipped, and why these live here instead.
 */
import type { Children } from '@src/types/node.type'
import { Div, H2, Span } from '@src/components/html.node'
import { Component } from '@src/hoc/component.hoc'

const rows = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bea' },
]

// --- The shape the release documents: a sibling beside a generated list ---
export const nested = Div({
  children: [H2('Members'), rows.map(row => Div({ key: row.id, children: row.name }))],
})

// --- The spread it replaces, which must keep compiling ---
export const spread = Div({
  children: [H2('Members'), ...rows.map(row => Div({ key: row.id, children: row.name }))],
})

// --- Depth, since the runtime places no limit on it ---
export const deep = Div({
  children: [Span('one'), [Span('two'), [Span('three'), [Span('four'), [Span('five'), [Span('six'), [Span('seven')]]]]]]],
})

// --- A children-first factory takes the same shape in its first position ---
export const childrenFirst = H2([Span('a'), rows.map(row => Span(row.name))])

// --- `readonly` is what lets an `as const` list through; a mutable one still fits ---
const frozen = [Span('a'), [Span('b')]] as const
export const readonlyChildren = Div({ children: frozen })
const mutable: Children[] = [Span('a'), [Span('b')]]
export const mutableChildren = Div({ children: mutable })

// --- An annotated `Children` holds every one of those ---
export const annotated: Children = [Span('a'), [Span('b'), [Span('c')]]]

// --- A component's own children prop, which types the same alias ---
const Panel = Component(({ children }: { children?: Children }) => Div({ children }))
export const componentChildren = Panel({ children: [H2('t'), rows.map(row => Span(row.name))] })

// --- Controls. Widening a union until it accepts arrays can quietly accept
//     anything; these must still be rejected, and `@ts-expect-error` fails the
//     build if they are not.
// @ts-expect-error a plain object is not a node, at any depth
export const rejectsObject = Div({ children: [Span('a'), [{ not: 'a node' }]] })
// @ts-expect-error and not at the top level either
export const rejectsObjectFlat = Div({ children: { not: 'a node' } })
