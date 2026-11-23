import type { Theme } from '@src/types/node.type.js'
import { type DroppedReport, type ServerThemedText, themedTexts, type ThemedText, type ThemedTextResolver } from '@src/util/themed-text-slot.util.js'
import { removeBlocksWithThemeTokens, replaceKeyTokens, textHasThemeTokenInPrelude } from '@src/util/theme-key.util.js'
import { concreteTokenSignature, concreteTokenValue } from '@src/util/theme-value.util.js'
import { nameText } from '@src/util/style-name.util.js'

/** What a text's resolution reads: the paths of the tokens in its preludes, and its resolution for each theme seen. */
interface Plan {
  readonly paths: readonly string[]
  readonly byTheme: Map<string, ThemedText>
}

/**
 * Texts remembered at once, each with its plan or `null` for one with no token
 * in a prelude. A long-lived server sees every text its pages register, and the
 * registry holds them already, so the map is dropped and started again when full.
 */
const MAX_TEXTS = 4096
/** Resolutions remembered for one text: one per set of values its tokens take, as themes and nested providers give them. */
const MAX_THEMES_PER_TEXT = 16

let plans = /* @__PURE__ */ new Map<string, Plan | null>()
let resolutions = 0

function planOf(text: string): Plan | null {
  let plan = plans.get(text)
  if (plan === undefined) {
    if (textHasThemeTokenInPrelude(text)) {
      const paths = new Set<string>()
      replaceKeyTokens(
        text,
        path => {
          paths.add(path)
          return undefined
        },
        true,
      )
      plan = { paths: [...paths], byTheme: new Map() }
    } else {
      plan = null
    }
    if (plans.size >= MAX_TEXTS) plans = new Map()
    plans.set(text, plan)
  }
  return plan
}

/**
 * Whether a named style's text holds a theme token in a condition or a selector,
 * whose value only the theme where the element renders can give. Its element
 * renders through `StyledRenderer`, which reads that theme.
 * @param text The style's serialized text.
 */
export function hasThemedPreludes(text: string): boolean {
  return planOf(text) !== null
}

/**
 * A named style's text for `theme`, as the uncompiled path writes the style it
 * was serialized from: each token in a prelude takes the value
 * `ThemeUtil.resolveObjWithTheme` gives a key, and each block whose prelude
 * still holds one is left out, as `ThemeUtil.dropThemedKeys` leaves out
 * its key. A serialized style writes each key before its block, and each block
 * on its own, so resolving the text is resolving the style, then serializing it.
 * Resolved once for each set of values the tokens take.
 * @param text The style's serialized text, its preludes holding their tokens.
 * @param theme The theme where the element renders.
 * @returns The resolution, or `undefined` for a text with no token in a prelude.
 */
export function textForTheme(text: string, theme: Theme | undefined): ThemedText | undefined {
  const plan = planOf(text)
  if (plan === null) return undefined
  const signature = concreteTokenSignature(theme, plan.paths)
  let themed = plan.byTheme.get(signature)
  if (themed === undefined) {
    resolutions++
    const resolved = replaceKeyTokens(text, path => concreteTokenValue(theme, path), true)
    const dropped: string[] = []
    const styles = removeBlocksWithThemeTokens(resolved, prelude => dropped.push(prelude))
    themed = { name: nameText(styles), styles, dropped }
    if (plan.byTheme.size >= MAX_THEMES_PER_TEXT) plan.byTheme.clear()
    plan.byTheme.set(signature, themed)
  }
  return themed
}

/** Test seam: how many texts are planned, and how many resolutions were made. */
export const __themedTextState = (): { texts: number; resolutions: number } => ({ texts: plans.size, resolutions })

/** Test seam: forgets every plan and resolution. */
export const __resetThemedText = (): void => {
  plans = new Map()
  resolutions = 0
}

/**
 * The end of the top-level part of serialized CSS text that starts at `from`: a
 * declaration through its `;`, or a block through its closing `}`. Quoted text
 * and parentheses hide what they hold.
 */
function partEnd(text: string, from: number): { end: number; block: boolean } {
  let depth = 0
  let parens = 0
  let quote: string | undefined
  let block = false
  for (let i = from; i < text.length; i++) {
    const char = text[i]
    if (quote !== undefined) {
      if (char === '\\') i++
      else if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') parens++
    else if (char === ')') parens = Math.max(0, parens - 1)
    else if (parens === 0 && char === '{') {
      depth++
      block = true
    } else if (parens === 0 && char === '}') {
      if (--depth === 0) return { end: i + 1, block }
    } else if (parens === 0 && depth === 0 && char === ';') return { end: i + 1, block: false }
  }
  return { end: text.length, block }
}

/**
 * A named style's text split as `ThemeUtil.splitThemedCss` splits the
 * style it was serialized from, where no theme is in scope to resolve its
 * conditions: every declaration, and every block before the first one holding a
 * theme token in a prelude at any depth, compile with no theme; the rest, from
 * that block on, resolves where the theme is. A serialized style writes its
 * parts in the order of its keys, so each part keeps its place.
 * @param text The style's serialized text.
 * @returns The two texts; `themed` is empty when no prelude holds a token.
 */
export function splitThemedText(text: string): { plain: string; themed: string } {
  let plain = ''
  let themed = ''
  let reached = false
  for (let at = 0; at < text.length;) {
    const { end, block } = partEnd(text, at)
    const part = text.slice(at, end)
    if (!block) plain += part
    else {
      reached ||= textHasThemeTokenInPrelude(part)
      if (reached) themed += part
      else plain += part
    }
    at = end
  }
  return { plain, themed }
}

/** {@link textForTheme}, each block left out given to `report`, as the uncompiled path reports a key it leaves out. */
function forRender(text: string, theme: Theme | undefined, report: DroppedReport | undefined): ThemedText | undefined {
  const themed = textForTheme(text, theme)
  if (themed !== undefined && report !== undefined) for (const prelude of themed.dropped) report(prelude)
  return themed
}

/**
 * The text as the server layer compiles it: resolved against a theme in scope,
 * as css's keys are; with none, split as css is (see {@link splitThemedText}).
 */
function forServer(text: string, theme: Theme | undefined, report: DroppedReport | undefined): ServerThemedText | undefined {
  if (!hasThemedPreludes(text)) return undefined
  if (theme) return forRender(text, theme, report)
  const { plain, themed } = splitThemedText(text)
  return { styles: plain, identity: text, ...(themed && { themed }) }
}

/** This module's resolver, as {@link themedTexts} holds it. */
const RESOLVER: ThemedTextResolver = { has: hasThemedPreludes, forRender, forServer }

/** Gives {@link themedTexts} this module's resolver: called wherever a compiled style is registered. */
export function installThemedText(): void {
  themedTexts.resolver ??= RESOLVER
}
