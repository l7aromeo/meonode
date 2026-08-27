'use client'
import { useMemo, type ReactElement } from 'react'
import type { DependencyList, NodeInstance } from '@src/types/node.type.js'

/**
 * Holds one memoized subtree in a fiber of its own.
 *
 * This replaced a global `Map` of rendered elements. That map had to *derive*
 * an identity for each memoized node — from its props and its position in the
 * tree — and the derivation was the source of two structural bugs: two nodes
 * deriving the same key shared one entry and rendered each other's content, and
 * nothing released an entry when the node behind it unmounted, because only a
 * render root carried an unmount hook.
 *
 * A fiber has neither problem. Identity is the fiber, so two subtrees are
 * distinct because React says they are, with nothing to derive and nothing to
 * collide. Release is React dropping the fiber, so an unmounted subtree's memo
 * is gone with it — no sweeper, no `FinalizationRegistry`, no tracking.
 *
 * `node.render()` runs inside `useMemo`, so an unchanged `deps` skips the whole
 * subtree walk exactly as a cache hit did.
 *
 * Client-only, and only ever *rendered*, never called. `node` is a `BaseNode`
 * instance and could not cross an RSC boundary; the caller must not create this
 * element on the server, where `deps` is a no-op anyway.
 * @param props.node The memoized node.
 * @param props.deps Its dependency list.
 * @returns The subtree, rebuilt only when `deps` change.
 */
export default function MeoMemo({ node, deps }: { node: NodeInstance; deps: DependencyList }): ReactElement {
  // `true` marks the subtree as already memoized, so `render` builds it rather
  // than wrapping it in another `MeoMemo` — the node still carries the `deps`
  // that put it here.
  return useMemo(() => node.render(true), deps)
}
