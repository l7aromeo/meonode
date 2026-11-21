import { createElement, Fragment, type ReactElement } from 'react'
import { NodeUtil } from '@src/util/node.util.js'
import { STATIC_CSS_BUCKETS, staticHref, staticModuleTexts, staticPrecedence, STATIC_CSS_PREFIX } from '@src/util/static-css.util.js'

/**
 * One empty hoistable style per bucket. React orders precedences by the first
 * style it meets in each, so every render that emits static css meets these
 * first, and the buckets reach the head in bucket order whichever a page uses.
 */
const SEEDS: readonly ReactElement[] = Array.from({ length: STATIC_CSS_BUCKETS }, (_, bucket) =>
  createElement('style', { key: `${STATIC_CSS_PREFIX}${bucket}`, href: `${STATIC_CSS_PREFIX}${bucket}`, precedence: staticPrecedence(bucket) }, ''),
)

/** Each module's hoistable styles, built once: modules are bounded by the code. */
const moduleElements = new Map<string, readonly ReactElement[]>()

function elementsOf(moduleId: string): readonly ReactElement[] {
  let elements = moduleElements.get(moduleId)
  if (elements) return elements
  const texts = staticModuleTexts(moduleId) ?? []
  const built: ReactElement[] = []
  for (let bucket = 0; bucket < texts.length; bucket++) {
    if (texts[bucket] === '') continue
    const href = staticHref(moduleId, bucket)
    built.push(createElement('style', { key: href, href, precedence: staticPrecedence(bucket) }, texts[bucket]))
  }
  elements = built
  moduleElements.set(moduleId, elements)
  return elements
}

/**
 * The static css a render uses, as React hoistable styles, on the server; nothing
 * in the browser.
 *
 * The browser inserts every module's rules itself when the module loads, and
 * reads which ones a server-rendered page already holds. The server cannot, so a
 * render places one of these in its tree, and the browser renders the same
 * component returning nothing: the tree has the same shape on both sides, which
 * keeps `useId` stable through hydration, and a hoistable leaves nothing in place
 * for hydration to match.
 * @param props.modules The modules whose rules the render's static classes need.
 */
export function StaticStyles({ modules }: { modules?: readonly string[] }): ReactElement | null {
  if (!NodeUtil.isServer) return null
  const children: ReactElement[] = [...SEEDS]
  for (const moduleId of modules ?? []) children.push(...elementsOf(moduleId))
  return createElement(Fragment, null, children)
}

/** Test seam: forgets the built module elements. */
export const __resetStaticStyles = (): void => moduleElements.clear()
