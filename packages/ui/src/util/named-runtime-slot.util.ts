import type { EmotionCache } from '@emotion/cache'
import type { ThemeContextState } from '@src/components/theme-provider.client.js'
import type { Theme } from '@src/types/node.type.js'
import type { ReactElement } from 'react'
import type StyledRenderer from '@src/components/styled-renderer.client.js'
import type { NamedStyle } from '@src/util/named-style.util.js'
import type { ThemeVarIndex } from '@src/util/theme-diagnostics.util.js'
import type { WalkContexts } from '@src/util/walk-contexts.util.js'

/**
 * One render's walk over the named nodes compiled output marks: the run of
 * their styles since the last rule, the carriers that insert it, and the cuts
 * that end it (see `named-runtime.util.ts`). Nodes are the walk's own `BaseNode`s.
 */
export interface NamedWalk {
  /** Whether named nodes' theme variables are checked, in development. */
  readonly checks: boolean
  /** A cut: the run since the last rule goes in after that rule, and what follows is no longer next to it. */
  cut(): void
  /** Whether a child must have a cut before it: one that may put its rules out of the walk's order. */
  cutsAt(child: unknown): boolean

  /**
   * A node's begin phase: it joins the run since the last rule as a named node,
   * or takes it as a runtime node or carrier.
   * @returns The scope its children are in.
   */
  begin(node: object, props: Record<string, unknown>, target: unknown, scope: EmotionCache | null): EmotionCache | null
  /** A node's complete phase, before its element is made: a component, boundary or memoized node cuts the run. */
  complete(node: object, target: unknown): void
  /** The theme scope below a provider, for the checks: its tokens joined to `own`, or `null` below another component. */
  scopeBelow(target: unknown, props: Record<string, unknown>, own: ThemeVarIndex | undefined): ThemeVarIndex | undefined | null

  /**
   * A named node's class, composed in its begin phase, its theme variables
   * checked in development.
   */
  classOf(node: object, text: string | undefined, opaqueAbove: boolean, themeOwn: ThemeVarIndex | undefined): string | undefined
  /** Whether a named node renders through `StyledRenderer`, as a carrier or with no cache to read. */
  rendersAtRender(node: object): boolean
  /** The run props a node's `StyledRenderer` is given, if any. */
  runProps(node: object): Record<string, unknown> | undefined
  /** The walk's end: the run since the last rule goes in after it, and the checks after commit are queued. */
  finish(): void
}

/** What only compiled output reaches: installed when it registers a style, so an app without it loads none of this. */
export interface NamedRuntime {
  /** A walk over a render's named nodes, or `undefined` while nothing is registered. */
  walk(): NamedWalk | undefined
  /** The registered text of a whole style, by its name. */
  textOf(name: string): string | undefined
  /** A registered template's text with its holes filled, and its name, or `undefined`. */
  template(id: string, values: readonly unknown[]): { name: string; text: string } | undefined
  /** The contexts a memoized subtree's walk reads, read by the component around it, or `undefined` while nothing is registered. */
  memoContexts(): WalkContexts | undefined
  /** Runs `run` with `contexts` as the ones its walk reads. */
  withContexts<T>(contexts: WalkContexts, run: () => T): T

  /**
   * A cache for a server render with no provider, for an element carrying a run:
   * only a walk's runs reach a server render's own-class path.
   */
  standInServerCache(): EmotionCache
  /** The `<style>` a server render writes for a rule and the runs beside it (see `named-style.util.ts`). */
  serverStyleElement(cache: EmotionCache, styles: readonly NamedStyle[]): ReactElement | null

  /**
   * The component a server component hands a client reference whose style the
   * compiler named (see `compiled-styled-renderer.client.ts`). The server's
   * client reference to it is made only here, so an app without the compiler
   * loads none of it in the browser.
   */
  readonly clientRenderer: (props: Parameters<typeof StyledRenderer>[0]) => ReturnType<typeof StyledRenderer>
}

/** The runtime, once a compiled style is registered. */
export const namedRuntime: { current?: NamedRuntime } = {}

/** A compiled node's style, as the compiler serialized it, handed to `StyledRenderer` in place of css. */
export interface CompiledStyle {
  readonly name: string
  readonly styles: string
}

/** How `StyledRenderer` renders a compiled style, once something reaching one installed it (see `compiled-style.util.ts`). */
export const compiledStyles: {
  resolve?: (compiled: CompiledStyle, theme: Theme | undefined, context: ThemeContextState | null) => CompiledStyle
} = {}
