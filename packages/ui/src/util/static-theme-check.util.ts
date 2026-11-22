import { ThemeContext, type ThemeContextState } from '@src/components/theme-provider.client.js'
import { mountedThemeVarIndex, reportThemeVarRefs, type ThemeVarIndex, type ThemeVarRef } from '@src/util/theme-diagnostics.util.js'

// The browser half of the development check of extracted styles' theme
// variables: elements under a component inside the render, which may provide
// another theme, are checked once they are committed.

/**
 * Theme variables of extracted styles on elements under a component inside the
 * render, which may provide another theme, so they are checked on each element
 * after commit, against the providers above that element.
 */
export interface StaticThemeCandidate {
  /** The node's static classes: every element with all of them reads `refs`. */
  classes: string
  refs: readonly ThemeVarRef[]
  /** Those its `--mv-*` variables' values hold, read by the element that sets the variable. */
  valueRefs: readonly (readonly [valueVar: string, refs: readonly ThemeVarRef[]])[]
}

/** React's `$$typeof` of a context provider before React 19, where the provider was not the context itself. */
const REACT_PROVIDER_TYPE = Symbol.for('react.provider')

/** The prefix of the key under which React DOM keeps an element's fiber; a random suffix follows. */
const FIBER_KEY_PREFIX = '__reactFiber$'

/**
 * The nearest theme provider above a rendered element: the context the element
 * would read. Development only.
 *
 * It reads React's internals, as React's devtools do, and nothing else of them:
 * the element's `__reactFiber$…` key; on each fiber, `return`, its parent, and
 * `type`, which for a provider is the context itself, or before React 19 an
 * object of `$$typeof` `react.provider` whose `_context` is the context; and on
 * the provider's fiber, `memoizedProps.value`, the value it provides.
 * @param element A rendered element.
 * @returns The provider's state; `null` when none is above; `undefined` when any of those fields is missing.
 */
export function nearestThemeContext(element: Element): ThemeContextState | null | undefined {
  const key = Object.keys(element).find(name => name.startsWith(FIBER_KEY_PREFIX))
  if (key === undefined) return undefined
  let fiber: unknown = (element as unknown as Record<string, unknown>)[key]
  while (fiber !== null) {
    if (typeof fiber !== 'object' || fiber === undefined || !('return' in fiber) || !('type' in fiber)) return undefined
    const type = fiber.type as { $$typeof?: unknown; _context?: unknown } | null
    if (
      type === (ThemeContext as unknown) ||
      (typeof type === 'object' && type !== null && type.$$typeof === REACT_PROVIDER_TYPE && type._context === ThemeContext)
    ) {
      const props = 'memoizedProps' in fiber ? (fiber.memoizedProps as { value?: unknown } | null) : undefined
      return props && 'value' in props ? ((props.value as ThemeContextState | null) ?? null) : undefined
    }
    fiber = fiber.return
  }
  return null
}

/**
 * Checks each element that carries a candidate's classes against the providers
 * above it. An element without React's fiber to read is checked against every
 * mounted provider instead, once the commit's effects have run: a provider above
 * records its tokens in an effect that runs after this one.
 * @param candidates The render's candidates.
 */
export function checkCandidates(candidates: readonly StaticThemeCandidate[]): void {
  const unread: [Element, StaticThemeCandidate][] = []
  for (const candidate of candidates) {
    const names = candidate.classes.split(' ')
    for (const element of document.getElementsByClassName(names[0])) {
      if (!names.every(name => element.classList.contains(name))) continue
      const context = nearestThemeContext(element)
      if (context === undefined) unread.push([element, candidate])
      else checkElement(element, candidate, context ? context.definedVars() : null)
    }
  }
  if (unread.length > 0)
    queueMicrotask(() => {
      const defined = mountedThemeVarIndex()
      for (const [element, candidate] of unread) checkElement(element, candidate, defined)
    })
}

/**
 * Reports what of a candidate an element reads and `defined` lacks: the theme
 * variables of its classes, and those of the `--mv-*` variables it sets.
 * @param element An element with the candidate's classes.
 * @param candidate The candidate.
 * @param defined What the providers above the element define, or `null` when there are none.
 */
function checkElement(element: Element, { refs, valueRefs }: StaticThemeCandidate, defined: ThemeVarIndex | null): void {
  reportThemeVarRefs(refs, defined)
  const style = (element as HTMLElement).style
  for (const [valueVar, ownRefs] of valueRefs) if (style?.getPropertyValue(valueVar).includes('--meonode-theme-')) reportThemeVarRefs(ownRefs, defined)
}

/** What makes two renders' candidates the same, so they are checked again only when that changes. */
export const candidatesKey = (candidates: readonly StaticThemeCandidate[] | undefined): string =>
  candidates ? candidates.map(({ classes, refs, valueRefs }) => `${classes}|${refs.join()}|${valueRefs.join()}`).join('\n') : ''
