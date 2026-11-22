import type { EmotionCache } from '@emotion/cache'
import { serializeStyles, type SerializedStyles } from '@emotion/serialize'
import { getRegisteredStyles, insertStyles, registerStyles } from '@emotion/utils'
import { createElement, type ReactElement } from 'react'
import { createServerCssCache } from '@src/util/server-css-cache.util.js'
import { nameStyles } from '@src/util/style-name.util.js'

/**
 * A node's whole style, as the compiler serialized it, ready for Emotion's own
 * `insertStyles`: what `StyledRenderer` would hand Emotion for the same css.
 */
export interface NamedStyle {
  serialized: SerializedStyles
  /** Whether the element is a host element, which `registerStyles` reads. */
  isStringTag: boolean

  /**
   * On a server render with no cache provider, the cache of the outermost styled
   * element above the node. Emotion gives such an element a cache of its own,
   * which every styled element below it shares, so a style goes out once per
   * scope: again in another, not again in the same.
   */
  scope?: EmotionCache
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
 * The caches a server render stands in with where no provider gives one. Emotion
 * renders each element there under a cache of its own, so every rule goes out
 * where the element is, again when another element wrote it already; these
 * caches are shared by a run of styles, so they write each again instead.
 */
const standIns = new WeakSet<EmotionCache>()

/**
 * A cache for a server render that has no provider, which writes every style it
 * is handed, as Emotion's cache of one element would.
 * @returns The cache.
 */
export function standInServerCache(): EmotionCache {
  const cache = createServerCssCache()
  standIns.add(cache)
  return cache
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
  const repeats = standIns.has(cache)
  for (const { serialized, isStringTag, scope } of styles) {
    // Into its scope's cache, which writes it once, as Emotion's shared one does.
    const target = scope ?? cache
    if (repeats && scope === undefined)
      for (let current: SerializedStyles | undefined = serialized; current !== undefined; current = current.next) delete cache.inserted[current.name]
    const inserted = insertStyles(target, serialized, isStringTag)
    if (inserted === undefined) continue
    rules += inserted
    for (let current: SerializedStyles | undefined = serialized; current !== undefined; current = current.next) names += ` ${current.name}`
  }
  if (rules === '') return null
  return createElement('style', { key, 'data-emotion': `${cache.key}${names}`, dangerouslySetInnerHTML: { __html: rules }, nonce: cache.sheet.nonce })
}

/**
 * The runs handed to MeoNode's own components, by the props of their element:
 * the named styles that began before the component in the walk that renders it,
 * which its own walk puts in ahead of its rules. Kept for every render of those
 * props, since React may render a component again with the same ones.
 */
const runsForComponent = new WeakMap<object, readonly NamedStyle[]>()

/** The run the next walk to begin starts with, set by a component right before its walk. */
let inheritedRun: readonly NamedStyle[] | undefined

/**
 * Hands `run` to the MeoNode component an element of `props` renders.
 * @param props The element's props.
 * @param run The named styles that began before it.
 */
export function handRunTo(props: object, run: readonly NamedStyle[]): void {
  const had = runsForComponent.get(props)
  runsForComponent.set(props, had ? [...had, ...run] : run)
}

/**
 * Hands the run handed to an element's props to the props of its copy, which
 * React renders in its place.
 * @param from The element's props.
 * @param to The copy's.
 */
export function passRunToCopy(from: object, to: object): void {
  const run = runsForComponent.get(from)
  if (run) handRunTo(to, run)
}

/**
 * Runs `walk` with the run handed to the component rendering `props`, which the
 * walk begins with.
 * @param props The component's props.
 * @param walk Its walk.
 * @returns What the walk returns.
 */
export function withHandedRun<T>(props: object, walk: () => T): T {
  inheritedRun = runsForComponent.get(props)
  try {
    return walk()
  } finally {
    inheritedRun = undefined
  }
}

/**
 * The run handed to the component whose walk is beginning, once.
 * @returns The run, or `undefined`.
 */
export function takeHandedRun(): readonly NamedStyle[] | undefined {
  const run = inheritedRun
  inheritedRun = undefined
  return run
}

/** Marks a MeoNode component whose walk takes the run handed to it. */
export const TAKES_RUN = '__meonodeTakesRun'

/**
 * Whether an element of `type` is a MeoNode component whose walk takes a handed run.
 * @param type The element's type.
 * @returns Whether it takes one.
 */
export const takesRun = (type: unknown): boolean => typeof type === 'function' && (type as { [TAKES_RUN]?: boolean })[TAKES_RUN] === true
