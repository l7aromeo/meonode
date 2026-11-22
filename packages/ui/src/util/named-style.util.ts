import type { EmotionCache } from '@emotion/cache'
import { serializeStyles, type SerializedStyles } from '@emotion/serialize'
import { getRegisteredStyles, insertStyles, registerStyles } from '@emotion/utils'
import { createElement, type ReactElement } from 'react'
import { nameStyles } from '@src/util/style-name.util.js'

/**
 * A node's whole style, as the compiler serialized it, ready for Emotion's own
 * `insertStyles`: what `StyledRenderer` would hand Emotion for the same css.
 */
export interface NamedStyle {
  serialized: SerializedStyles
  /** Whether the element is a host element, which `registerStyles` reads. */
  isStringTag: boolean
}

/**
 * The class a compiled node renders with, and the style to insert for it, as
 * `StyledRenderer`'s `renderOwnClass` computes them for the same css: classes in
 * a string `className` that the cache registered are folded into the style,
 * which then takes the name of the whole; the rest stay, ahead of
 * `${cache.key}-${name}`. Registers the style with the cache, as Emotion does
 * while rendering.
 * @param cache The Emotion cache the element renders under.
 * @param name The compiler's name for the node's style.
 * @param styles The compiler's serialized text for it.
 * @param givenClass The node's own `className`.
 * @param isStringTag Whether the element is a host element.
 * @returns The element's `className`, and the style to insert.
 */
export function namedClass(
  cache: EmotionCache,
  name: string,
  styles: string,
  givenClass: unknown,
  isStringTag: boolean,
): { className: string; style: NamedStyle } {
  let className = ''
  const registered: string[] = [styles]
  if (typeof givenClass === 'string') className = getRegisteredStyles(cache.registered, registered, givenClass)
  else if (givenClass != null) className = `${givenClass as string} `
  // With nothing folded in, the compiler's name is the one Emotion's pipeline
  // would give the text; folded, the text is another and so is its name.
  const serialized: SerializedStyles = registered.length === 1 ? { name, styles, next: undefined } : nameStyles(serializeStyles(registered))
  registerStyles(cache, serialized, isStringTag)
  return { className: className + `${cache.key}-${serialized.name}`, style: { serialized, isStringTag } }
}

/**
 * Inserts styles into a server render's cache, and renders what Emotion's own
 * `Insertion` renders for them there: one `<style data-emotion>` in place, with
 * the rules of those the cache did not hold yet, which Emotion's cache in the
 * browser adopts by those names and moves before hydration. A cache that
 * collects its rules instead, as a registry's does, returns none, so nothing
 * renders.
 * @param cache The server render's cache.
 * @param styles The styles, in the order they go in.
 * @param key The element's key.
 * @returns The element, or `null` when no rule went in.
 */
export function serverStyleElement(cache: EmotionCache, styles: readonly NamedStyle[], key?: string): ReactElement | null {
  let names = ''
  let rules = ''
  for (const { serialized, isStringTag } of styles) {
    const inserted = insertStyles(cache, serialized, isStringTag)
    if (inserted === undefined) continue
    rules += inserted
    for (let current: SerializedStyles | undefined = serialized; current !== undefined; current = current.next) names += ` ${current.name}`
  }
  if (rules === '') return null
  return createElement('style', { key, 'data-emotion': `${cache.key}${names}`, dangerouslySetInnerHTML: { __html: rules }, nonce: cache.sheet.nonce })
}
