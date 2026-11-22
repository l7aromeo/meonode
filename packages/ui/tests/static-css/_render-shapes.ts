// What every `.render()` in a run returns, by structure: each element's key and
// its children, nested, with each child's position kept (a `null` included)
// and the element's type left out. A compiled walk may render a node through
// `StyledRenderer` where its runtime twin renders the host, but it must return
// the same elements with the same keys and children, so a user who inspects
// or clones the result, or React reconciling it, sees the same tree.
import { isValidElement, type ReactNode } from 'react'
import { BaseNode } from '@src/core.node.js'
import { __resetUncarriedReports, __uncarriedReports } from '@src/util/named-style.util.js'

/** The structure of `node`: an element's key and children, nested; anything else by kind. */
export function structureOf(node: ReactNode): unknown {
  if (Array.isArray(node)) return node.map(structureOf)
  if (isValidElement(node)) {
    const children = (node.props as { children?: ReactNode }).children
    return children === undefined ? { key: node.key } : { key: node.key, children: structureOf(children) }
  }
  return node === null || node === undefined || typeof node === 'boolean' ? String(node) : typeof node
}

/** What a run returned, with the structure of its renders and the uncarried runs reported: beside an array, on an object. */
interface Shapes {
  renders: unknown[]
  uncarried: readonly string[]
}
export type Shaped<T> = T extends readonly unknown[] ? { result: T } & Shapes : T & Shapes

/**
 * Runs `run` and adds to what it returns the structure of every `.render()` it
 * made, in order, and the styles whose run no carrier or runtime node took, so
 * a comparison against the runtime twin, which has none, compares them too.
 * @param run The run, returning an object.
 * @returns What it returned, with `renders`; an array as `result`.
 */
export function withRenderShapes<T extends object>(run: () => T): Shaped<T> {
  const renders: unknown[] = []
  const render = BaseNode.prototype.render
  BaseNode.prototype.render = function (this: BaseNode, ...args: Parameters<typeof render>) {
    const element = render.apply(this, args)
    renders.push(structureOf(element))
    return element
  }
  __resetUncarriedReports()
  try {
    const result = run()
    return Object.assign(Array.isArray(result) ? { result } : { ...result }, { renders, uncarried: __uncarriedReports() }) as Shaped<T>
  } finally {
    BaseNode.prototype.render = render
  }
}

/** `run`, adding the structure of the renders it made to what it returns. */
export const shaped =
  <A extends unknown[], T extends object>(run: (...args: A) => T) =>
  (...args: A): Shaped<T> =>
    withRenderShapes(() => run(...args))
