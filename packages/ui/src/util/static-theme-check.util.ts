import { ThemeContext, type ThemeContextState } from '@src/components/theme-provider.client.js'
import { mountedThemeVarIndex, reportThemeVarRefs, type ThemeVarRef } from '@src/util/theme-diagnostics.util.js'

// The browser half of the development check of named styles' theme variables:
// elements under a component inside the render, which may provide another
// theme, are checked once they are committed.

/**
 * Theme variables of a named style on elements under a component inside the
 * render, which may provide another theme, so they are checked on each element
 * after commit, against the providers above that element.
 */
export interface StaticThemeCandidate {
  /** The node's classes: every element with all of them reads `refs`. */
  classes: string
  refs: readonly ThemeVarRef[]
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
 * @param checked When given, the candidates each element was checked for, by
 * {@link candidatesKey}: an element is checked once per candidate.
 */
export function checkCandidates(candidates: readonly StaticThemeCandidate[], checked?: WeakMap<Element, Set<string>>): void {
  const unread: [Element, StaticThemeCandidate][] = []
  for (const candidate of candidates) {
    const names = candidate.classes.split(' ')
    for (const element of document.getElementsByClassName(names[0])) {
      if (!names.every(name => element.classList.contains(name))) continue
      if (checked !== undefined) {
        let seen = checked.get(element)
        if (!seen) checked.set(element, (seen = new Set()))
        const key = candidatesKey([candidate])
        if (seen.has(key)) continue
        seen.add(key)
      }
      const context = nearestThemeContext(element)
      if (context === undefined) unread.push([element, candidate])
      else reportThemeVarRefs(candidate.refs, context ? context.definedVars() : null)
    }
  }
  if (unread.length > 0)
    queueMicrotask(() => {
      const defined = mountedThemeVarIndex()
      for (const [, candidate] of unread) reportThemeVarRefs(candidate.refs, defined)
    })
}

/** What makes two renders' candidates the same, so they are checked again only when that changes. */
export const candidatesKey = (candidates: readonly StaticThemeCandidate[] | undefined): string =>
  candidates ? candidates.map(({ classes, refs }) => `${classes}|${refs.join()}`).join('\n') : ''

/** How often {@link checkCandidatesAfterCommit} looks again for an element not committed yet. */
const COMMIT_RETRIES = 10
/** The wait between those looks, about a frame. */
const COMMIT_RETRY_MS = 16
/** The candidates each committed element was checked for, so a later render of the same element does not check it again. */
let checkedElements = new WeakMap<Element, Set<string>>()

/**
 * Checks candidates once their elements are committed, from a walk, which has
 * no effect of its own to run after commit: on the next task, and again about a
 * frame later for a candidate none of whose elements is in the document yet, as
 * a render React interrupts commits later. Development only, in the browser.
 * @param candidates The walk's candidates.
 */
export function checkCandidatesAfterCommit(candidates: readonly StaticThemeCandidate[]): void {
  const look = (pending: readonly StaticThemeCandidate[], tries: number) =>
    setTimeout(
      () => {
        const committed = pending.filter(({ classes }) => document.getElementsByClassName(classes.split(' ')[0]).length > 0)
        if (committed.length > 0) checkCandidates(committed, checkedElements)
        const later = pending.filter(candidate => !committed.includes(candidate))
        if (later.length > 0 && tries > 1) look(later, tries - 1)
      },
      tries === COMMIT_RETRIES ? 0 : COMMIT_RETRY_MS,
    )
  look(candidates, COMMIT_RETRIES)
}

/** Test seam: forgets which elements were checked. */
export const __resetCheckedCandidates = (): void => void (checkedElements = new WeakMap())
