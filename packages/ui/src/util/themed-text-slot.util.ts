import type { Theme } from '@src/types/node.type.js'

/**
 * A named style's text resolved for one theme: what the uncompiled path writes
 * for the style it was serialized from, under that theme.
 */
export interface ThemedText {
  /** The resolved text's name. */
  readonly name: string
  /** The text, each prelude's tokens given the theme's values. */
  readonly styles: string
  /** The preludes whose blocks were left out, still holding a token the theme has no value for. */
  readonly dropped: readonly string[]
}

/**
 * A named style's text as the server layer compiles it: under a theme in scope,
 * resolved, with its own name; with none, the part compiled there, named after
 * the whole text (`identity`), and the part from the first themed block on,
 * which `ThemedRule` resolves where the theme is.
 */
export interface ServerThemedText {
  readonly name?: string
  readonly styles: string
  readonly identity?: string
  readonly themed?: string
}

/**
 * Where a resolution's left-out blocks are reported, by their conditions: the
 * caller's development report, passed in so this module's resolver loads no
 * diagnostics (and so no `react`) of its own.
 */
export type DroppedReport = (prelude: string) => void

/** What renders a named style whose conditions hold theme tokens (see `themed-text.util.ts`). */
export interface ThemedTextResolver {
  /** Whether the text holds a theme token in a condition or a selector. */
  has(text: string): boolean
  /** The text resolved for `theme`, or `undefined` for a text with no such token; each block left out goes to `report`. */
  forRender(text: string, theme: Theme | undefined, report: DroppedReport | undefined): ThemedText | undefined
  /** The text as the server layer compiles it under `theme`, or `undefined` for a text with no such token; as {@link forRender} reports. */
  forServer(text: string, theme: Theme | undefined, report: DroppedReport | undefined): ServerThemedText | undefined
}

/**
 * The resolver, once a compiled style is registered: only compiled output
 * registers one, so an app built without the compiler never loads it. Until
 * then no named text exists, and none holds a token.
 */
export const themedTexts: { resolver?: ThemedTextResolver } = {}
