/**
 * The entry compiled output calls an imported factory through,
 * `@meonode/ui/factory-call`. It imports nothing, so a module the compiler
 * rewrites loads no React, no Emotion and no MeoNode core for it: a route
 * handler that calls a factory stays as light as the call was.
 *
 * A factory that `createNode` or `createChildrenFirstNode` made carries a brand
 * here, and only core makes one, so a branded callee means core is loaded and
 * its join runs. Any other callee is called as written.
 */

/** A call site of an imported factory, as the compiler hoists it to its module's top level. */
export interface FactoryCallSite {
  /** The argument the compiler found the call's props in: 0 for `(props)`, 1 for `(children, props)`. */
  readonly at: number
  /** `1` where the compiler's carrier rule gives the node a carrier, as it would a named node there. */
  readonly r?: 1
}

/** What core attaches to each factory it makes. */
export interface FactoryBrand {
  /**
   * Calls `callee` for `site` with `args`, as `callee(...args)` would, its style
   * joined with the factory's initial props.
   */
  join(callee: (...args: never[]) => unknown, site: FactoryCallSite, args: unknown[]): unknown
}

/**
 * Every factory core made, with its brand. Kept on `globalThis` under a
 * registered symbol, so it is one map wherever a bundle resolved this module
 * from: a factory's brand carries its own core's join, so which copy of core
 * made it does not matter.
 */
export const factoryBrands: WeakMap<object, FactoryBrand> = ((globalThis as Record<symbol, unknown>)[Symbol.for('@meonode/ui/factoryBrands')] ??= new WeakMap<
  object,
  FactoryBrand
>()) as WeakMap<object, FactoryBrand>

/**
 * Calls an imported factory for a call site the compiler could not merge with
 * the factory's initial props, which are in another module:
 * `__meoFactoryCall(Panel, site, ...args)` stands for `Panel(...args)`. A
 * factory core made joins the call's style with its initial props (see
 * `joinFactoryCall` in `core.node.ts`); anything else is called as written.
 * @param callee The binding the call site calls.
 * @param site The call site, hoisted by the compiler.
 * @param args The call's arguments, as written.
 * @returns What `callee(...args)` returns.
 */
export function __meoFactoryCall(callee: unknown, site: FactoryCallSite, ...args: unknown[]): unknown {
  const brand = typeof callee === 'function' ? factoryBrands.get(callee) : undefined
  return brand === undefined ? (callee as (...called: unknown[]) => unknown)(...args) : brand.join(callee as (...called: never[]) => unknown, site, args)
}
