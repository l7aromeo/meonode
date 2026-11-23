/**
 * The entry compiled output calls an imported factory through, in a module that
 * loads no other part of `@meonode/ui`: `@meonode/ui/factory-call`. It imports
 * nothing, so a module the compiler rewrites loads no React, no Emotion and no
 * MeoNode core for it: a route handler that calls a factory stays as light as
 * the call was. A module that imports `@meonode/ui` calls through the same name
 * from there, which carries the join (`factory-call/join.ts`).
 *
 * Core records each factory `createNode` or `createChildrenFirstNode` makes
 * here, with the slot its copy's join fills once loaded. A recorded factory
 * whose join is loaded joins the call; any other callee is called as written,
 * which is what the call does uncompiled.
 */

/** A call site of an imported factory, as the compiler hoists it to its module's top level. */
export interface FactoryCallSite {
  /** The argument the compiler found the call's props in: 0 for `(props)`, 1 for `(children, props)`. */
  readonly at: number
  /** `1` where the compiler's carrier rule gives the node a carrier, as it would a named node there. */
  readonly r?: 1
}

/** Joins a call of a factory with its initial props, as `factory(...args)` would build it, its style named. */
export type FactoryJoin = (
  shape: FactoryShape,
  factory: (...args: never[]) => unknown,
  site: FactoryCallSite,
  args: unknown[],
  caller: (...args: never[]) => unknown,
) => unknown

/** Where a copy of core's join goes once the module holding it loads: one object per copy of core. */
export interface FactoryJoinSlot {
  join?: FactoryJoin
}

/** A factory core made, as its join reads it. */
export interface FactoryShape {
  /** The element the factory renders. */
  readonly element: unknown
  /** The factory's initial props. */
  readonly initialProps: Record<string, unknown> | undefined
  /** The argument the factory reads a call's props from. */
  readonly propsAt: 0 | 1
  /** The slot of the copy of core that made the factory. */
  readonly core: FactoryJoinSlot
}

/**
 * Every factory core made, with its shape. Kept on `globalThis` under a
 * registered symbol, so it is one map wherever a bundle resolved this module
 * from: a shape carries its own core's slot, so which copy of core made it does
 * not matter.
 */
export const factoryShapes: WeakMap<object, FactoryShape> = ((globalThis as Record<symbol, unknown>)[Symbol.for('@meonode/ui/factoryShapes')] ??= new WeakMap<
  object,
  FactoryShape
>()) as WeakMap<object, FactoryShape>

/**
 * Calls a factory recorded in {@link factoryShapes} through its core's join, if
 * loaded, and anything else as written.
 * @param callee The binding the call site calls.
 * @param site The call site.
 * @param args The call's arguments, as written.
 * @param caller The function the call site called, left out of the stack a development report shows.
 */
export function callFactory(callee: unknown, site: FactoryCallSite, args: unknown[], caller: (...args: never[]) => unknown): unknown {
  const shape = typeof callee === 'function' ? factoryShapes.get(callee) : undefined
  const join = shape?.core.join
  return join === undefined
    ? (callee as (...called: unknown[]) => unknown)(...args)
    : join(shape!, callee as (...called: never[]) => unknown, site, args, caller)
}

/**
 * Calls an imported factory for a call site the compiler could not merge with
 * the factory's initial props, which are in another module:
 * `__meoFactoryCall(Panel, site, ...args)` stands for `Panel(...args)`. A
 * factory core made joins the call's style with its initial props once its
 * join is loaded (see `factory-call/join.ts`); anything else is called as
 * written.
 * @param callee The binding the call site calls.
 * @param site The call site, hoisted by the compiler.
 * @param args The call's arguments, as written.
 * @returns What `callee(...args)` returns.
 */
export function __meoFactoryCall(callee: unknown, site: FactoryCallSite, ...args: unknown[]): unknown {
  return callFactory(callee, site, args, __meoFactoryCall as (...args: never[]) => unknown)
}
