import { cloneElement, isValidElement } from 'react'
import { NodeUtil } from '@src/util/node.util.js'
import type { NodeElement } from '@src/types/node.type.js'
import { diagnosticsEnabled } from '@src/util/theme-diagnostics.util.js'

/**
 * Derives a stable identity for an item. Returning the same value for the same
 * logical row across renders is the whole contract — it is what lets a row keep
 * its DOM node, its focus and its state when the list around it changes.
 */
export type ForIdentity<T> = (item: T, index: number) => string | number

/** Reference identity, minted on first sight and remembered for the object's life. */
const referenceIds = new WeakMap<object, string>()
let referenceSeq = 0

/**
 * How many times each `For` call site has rendered, and whether it has already
 * been warned about. Development only, and keyed by call site because the
 * condition worth reporting — "every item is new *again*" — cannot be seen in a
 * single render: on mount every object is new, which is unremarkable.
 */
const callSites = new Map<string, { renders: number; warned: boolean }>()

function callSiteId(): string {
  const stack = new Error().stack
  if (!stack) return 'unknown'
  // [0] is the Error line, [1] this function, [2] For itself, [3] the caller.
  const frame = stack.split('\n')[3] ?? ''
  const match = frame.match(/\(?([^\s()]+:\d+:\d+)\)?\s*$/)
  return match ? match[1] : frame.trim() || 'unknown'
}

function referenceId(item: object): { id: string; fresh: boolean } {
  const seen = referenceIds.get(item)
  if (seen) return { id: seen, fresh: false }
  const id = 'r' + ++referenceSeq
  referenceIds.set(item, id)
  return { id, fresh: true }
}

/**
 * Renders a list whose rows keep their identity when the list changes.
 *
 * React matches children by position unless they carry a `key`, so deleting or
 * reordering an unkeyed list hands each surviving row the *previous* row's
 * fiber: its state, its focus, its uncommitted input. That is React's rule, not
 * this library's, and `children: items.map(...)` inherits it in full.
 *
 * The information needed to fix it — which row is which — lives in the data, so
 * this takes the data rather than the finished nodes and keys each row from it.
 * A row is identified by its object reference, which survives the row's contents
 * changing: renaming a row keeps its state, where hashing the contents would
 * throw it away on every keystroke.
 *
 * Pass `identity` whenever the items are rebuilt between renders — a `.map()`
 * that spreads, a fresh fetch, anything that produces new objects for the same
 * logical rows. Reference identity cannot see through that, and in development
 * this warns when it detects it rather than silently remounting the list.
 * @param items The data, one entry per row.
 * @param renderItem Builds a row. Receives the item, its index, and the key
 * this row was given — `For` applies that key itself, so the third argument is
 * only needed when something inside the row wants to reuse it.
 * @param identity Optional. Returns a stable id for an item — usually `item => item.id`.
 * @returns Keyed children, ready to pass as `children`.
 * @example
 * Div({ children: For(todos, todo => TodoRow({ todo })) })
 * Div({ children: For(todos, todo => TodoRow({ todo }), todo => todo.id) })
 */
export function For<T>(items: readonly T[], renderItem: (item: T, index: number, key: string) => NodeElement, identity?: ForIdentity<T>): NodeElement[] {
  // Two rows can legitimately be indistinguishable — two blank cells, two
  // zeroes. React requires keys to be unique among siblings, so a repeat falls
  // back to its position within the run. That is exactly the behaviour an
  // unkeyed list already has, so duplicates are never made worse by being here.
  const used = new Map<string, number>()
  let freshObjects = 0
  let objectItems = 0

  const out = items.map((item, index) => {
    let base: string
    if (identity) {
      base = String(identity(item, index))
    } else if (item !== null && typeof item === 'object') {
      objectItems++
      const { id, fresh } = referenceId(item as object)
      if (fresh) freshObjects++
      base = id
    } else {
      // Primitives identify themselves. Tagged so `1` and `'1'` do not collide.
      base = typeof item + ':' + String(item)
    }

    const repeat = used.get(base) ?? 0
    used.set(base, repeat + 1)
    const key = repeat === 0 ? base : `${base}#${repeat}`

    const rendered = renderItem(item, index, key)

    // A `Component` node has already been rendered to an element by the time it
    // gets here, so its key has to be set by cloning. A factory node is still a
    // node, and `props` is computed lazily from `rawProps`, so assigning to
    // `rawProps` before the render walk reads it is enough.
    if (isValidElement(rendered)) return cloneElement(rendered, { key })
    if (NodeUtil.isNodeInstance(rendered)) {
      ;(rendered.rawProps as { key?: string | number }).key = key
      return rendered
    }
    return rendered
  })

  // Every object is new on the first render, which says nothing. It is the
  // *second* render with an entirely new set that means the references cannot
  // be matched — and that every row is about to remount. Reported once per call
  // site, since it is a property of the code rather than of one frame.
  if (!identity && objectItems > 1 && freshObjects === objectItems && diagnosticsEnabled()) {
    const site = callSiteId()
    const seen = callSites.get(site) ?? { renders: 0, warned: false }
    const shouldWarn = seen.renders > 0 && !seen.warned
    callSites.set(site, { renders: seen.renders + 1, warned: seen.warned || shouldWarn })
    if (shouldWarn) {
      console.warn(
        '[MeoNode] For(): every item in this list is a new object, so reference identity cannot match this render against the last one ' +
          'and every row will remount — losing state, focus and scroll position. Pass an identity accessor: ' +
          'For(items, renderItem, item => item.id)',
      )
    }
  }

  return out
}
