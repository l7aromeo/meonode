import { diagnosticsEnabled, setDebugFlag } from '@src/constant/common.const.js'
import * as development from '@src/util/development-diagnostics.util.js'

/**
 * Every development diagnostic MeoNode runs, reached only through this module
 * and the stubs that register with it, so a production bundle carries the
 * stubs alone.
 *
 * Development and tests load the diagnostics with the rest of MeoNode, and each
 * check runs where it is made. A production bundle substitutes
 * `process.env.NODE_ENV`, which leaves each stub's static import unused, so the
 * bundler drops the diagnostics' modules and keeps only the lazy loads. There,
 * `setDebugMode(true)` starts them, and the checks made before they arrive wait
 * for them and run in the order they were made.
 *
 * The diagnostics come in tables: this module's, for what every app renders,
 * and `named-diagnostics.util.ts`, for the named styles of extraction, which a
 * bundle without them leaves out with the table.
 */

/** The development diagnostics of this module's table, as its checks receive them. */
export type Diagnostics = typeof development

/** A check, run with its table's diagnostics once they are loaded. */
export type Check<T = Diagnostics> = (diagnostics: T) => void

/** A table of diagnostics: loaded at once outside production, lazily in it. */
interface Table {
  loaded: unknown
  load: () => Promise<unknown>
}

/** The tables registered, this module's first. */
const tables: Table[] = []

/**
 * Checks held at once while the diagnostics load. A render makes three checks
 * for a node with no style, four with style props and five with a `css` object,
 * so this holds the first render of a page of twelve to twenty thousand
 * nodes; past it, checks are counted and reported as dropped. Held in full, as
 * by a server render of 15,000 styled nodes in Node 26, the checks keep about
 * 23 MB alive until the diagnostics arrive, half of it the stacks captured for
 * the generated-list report.
 */
const MAX_PENDING_CHECKS = 60_000

/** The checks made while the diagnostics load, in order, each after its table. */
let pending: (Table | Check<never>)[] | undefined
/** The checks made past {@link MAX_PENDING_CHECKS}. */
let dropped = 0
let loading = false

/**
 * Loads every table not loaded yet, then runs the checks made meanwhile. A
 * table registered while the others load, by a module evaluated meanwhile, is
 * loaded before any check runs, so the checks still run in order.
 */
function load(): void {
  if (loading) return
  loading = true
  Promise.all(tables.map(table => table.loaded ?? table.load().then(diagnostics => (table.loaded = diagnostics)))).then(
    () => {
      loading = false
      if (tables.some(table => table.loaded === undefined)) return load()
      const held = pending ?? []
      const missed = dropped
      pending = undefined
      dropped = 0
      for (let index = 0; index < held.length; index += 2) runPending(held[index] as Table, held[index + 1] as Check<unknown>)
      if (missed > 0) core().reportDroppedChecks(missed)
    },
    (error: unknown) => {
      loading = false
      pending = undefined
      dropped = 0
      console.error('[MeoNode] Debug mode could not load its diagnostics.', error)
    },
  )
}

/** This module's diagnostics, once every table is loaded. */
const core = (): Diagnostics => tables[0].loaded as Diagnostics

/**
 * Runs a held check. One that throws, as a development check does, can no
 * longer stop the render it was made in, so it is reported, and the rest still run.
 */
function runPending(table: Table, check: Check<unknown>): void {
  try {
    check(table.loaded)
  } catch (error) {
    core().reportFailedCheck(error)
  }
}

/**
 * Registers a table of diagnostics.
 * @param initial The diagnostics outside production; `undefined` in it.
 * @param loadTable Loads them in production.
 * @returns Runs a check now if they are loaded, or, while diagnostics are on, once they are; and reads them if loaded.
 */
export function registerDiagnostics<T>(
  initial: T | undefined,
  loadTable: () => Promise<T>,
): { withDiagnostics: (check: Check<T>) => void; loadedDiagnostics: () => T | undefined } {
  const table: Table = { loaded: initial, load: loadTable }
  tables.push(table)
  return {
    withDiagnostics: check => {
      if (table.loaded !== undefined) return check(table.loaded as T)
      if (!diagnosticsEnabled()) return
      if ((pending ??= []).length < 2 * MAX_PENDING_CHECKS) pending.push(table, check)
      else dropped++
      load()
    },
    loadedDiagnostics: () => table.loaded as T | undefined,
  }
}

/**
 * The diagnostics this module loads with it, outside production. The bare
 * `process.env.NODE_ENV` is what bundlers substitute, so a production build
 * folds the condition to `false` and drops the import. Its shape is what each
 * bundler can prune before it places modules in chunks:
 *
 * - a function of its own, since Rollup, and so Vite, leaves code inside a
 *   `try` as written, and would keep the import;
 * - exported, so a minifier keeps it out of the `try` too;
 * - an `if` that returns, which Terser keeps as an `if`: Turbopack prunes the
 *   import behind an `if` it can decide, but not behind the `&&` Terser makes
 *   of an `if` that assigns.
 * @returns The diagnostics, outside production.
 */
export function developmentDiagnostics(): Diagnostics | undefined {
  if (process.env.NODE_ENV !== 'production') return development
  return undefined
}

let initial: Diagnostics | undefined
// With no `process` and nothing substituted, the read throws, and that counts
// as production, as `isDevMode` counts it.
try {
  initial = developmentDiagnostics()
} catch {
  // Production.
}

// The lazy load is of a module of its own: see `lazy-diagnostics.util.ts`.
const coreTable = registerDiagnostics(initial, () => import('@src/util/lazy-diagnostics.util.js'))

/**
 * Runs a check now if the diagnostics are loaded, or, while diagnostics are on,
 * once they are. A check holds only what it reads.
 */
export const withDiagnostics = coreTable.withDiagnostics

/**
 * The diagnostics, if loaded: always outside production. For a render that
 * needs a check's answer at once, and does without it while they load.
 */
export const loadedDiagnostics = coreTable.loadedDiagnostics

/**
 * Turns MeoNode's debug mode on or off. On, it also turns the development
 * diagnostics on in a production build, loading them first: the checks made
 * before they arrive are reported once they do.
 * @param enabled Whether debug mode is on.
 */
export function setDebugMode(enabled: boolean): void {
  setDebugFlag(enabled)
  if (enabled) {
    console.log('[MeoNode] Debug mode enabled.')
    if (tables.some(table => table.loaded === undefined)) load()
  } else if (!diagnosticsEnabled()) {
    pending = undefined
    dropped = 0
  }
}

/**
 * {@link withDiagnostics} for a key in a style's condition or selector that holds
 * a theme token nothing could resolve. A function of its own, so a resolver can
 * be handed it.
 * @param key The key that was left out.
 */
export function reportUnresolvedThemeKey(key: string): void {
  if (diagnosticsEnabled()) withDiagnostics(d => d.reportUnresolvedThemeKey(key))
}

/**
 * Records a mounted provider's tokens until the returned cleanup runs, once the
 * diagnostics are loaded. A cleanup that runs first forgets the record before
 * it is made.
 * @param owner Identifies the provider.
 * @param tokens The provider's tokens.
 * @returns Removes the record.
 */
export function trackProviderTokens(owner: object, tokens: unknown): () => void {
  let release: (() => void) | undefined
  let mounted = true
  withDiagnostics(d => {
    if (mounted) release = d.trackProviderTokens(owner, tokens)
  })
  return () => {
    mounted = false
    release?.()
  }
}

/**
 * Watches a `Node` call for an unkeyed generated list. Its call site is read
 * from the stack, so a check that waits for the diagnostics captures the stack
 * where the call is made.
 * @param element The element the node renders.
 * @param props The props as the call site wrote them.
 * @param caller The function the call site called, which is left out of the stack.
 */
export function observeChildren(element: unknown, props: Record<string, unknown>, caller: (...args: never[]) => unknown): void {
  const loaded = loadedDiagnostics()
  if (loaded !== undefined) return loaded.observeChildren(element, props, caller)
  const site = captureStack(caller)
  withDiagnostics(d => d.observeChildren(element, props, caller, site))
}

/** The stack of a call, captured where it is made: read later, V8 still gives its frames. */
export interface CapturedStack {
  /** The frames above `caller`, as `Error.captureStackTrace` leaves them unread. */
  above: { stack?: unknown }
  /** The whole stack, for an engine that dropped `caller`'s frame. */
  whole: { stack?: unknown }
}

/**
 * Captures the stack above `caller` and the whole stack, both unread.
 * @param caller The function whose frame and everything above it are left out.
 * @returns Both stacks.
 */
function captureStack(caller: (...args: never[]) => unknown): CapturedStack {
  const capture = (Error as { captureStackTrace?: (target: object, constructorOpt?: (...args: never[]) => unknown) => void }).captureStackTrace
  const above: { stack?: unknown } = {}
  const whole = new Error()
  if (capture) capture(above, caller)
  else above.stack = whole.stack
  return { above, whole }
}
