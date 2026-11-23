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
 * above it, once per candidate when `checked` is given.
 *
 * An element without a fiber to read is server markup React has not hydrated
 * yet, or one whose internals this check cannot read. Unless `final`, it is left
 * unchecked and its candidate returned, to be looked at again: until React
 * hydrates it, the providers above it may not be mounted. When `final`, it is
 * checked against every mounted provider instead, once the commit's effects have
 * run, since a provider above records its tokens in an effect that runs after
 * this check.
 * @param candidates The render's candidates.
 * @param checked When given, the candidates each element was checked for, by
 * {@link candidatesKey}: an element is checked once per candidate.
 * @param final Whether to check an element without a fiber now, against the mounted providers.
 * @returns The candidates with an element left unchecked.
 */
export function checkCandidates(candidates: readonly StaticThemeCandidate[], checked?: WeakMap<Element, Set<string>>, final = true): StaticThemeCandidate[] {
  const unread: StaticThemeCandidate[] = []
  const deferred: StaticThemeCandidate[] = []
  for (const candidate of candidates) {
    const names = candidate.classes.split(' ')
    const key = candidatesKey([candidate])
    for (const element of document.getElementsByClassName(names[0])) {
      if (!names.every(name => element.classList.contains(name))) continue
      let seen = checked?.get(element)
      if (seen?.has(key)) continue
      const context = nearestThemeContext(element)
      if (context === undefined && !final) {
        if (!deferred.includes(candidate)) deferred.push(candidate)
        continue
      }
      if (checked !== undefined) {
        if (!seen) checked.set(element, (seen = new Set()))
        seen.add(key)
      }
      if (context === undefined) unread.push(candidate)
      else reportThemeVarRefs(candidate.refs, context ? context.definedVars() : null)
    }
  }
  if (unread.length > 0)
    queueMicrotask(() => {
      const defined = mountedThemeVarIndex()
      for (const candidate of unread) reportThemeVarRefs(candidate.refs, defined)
    })
  return deferred
}

/** What makes two renders' candidates the same, so they are checked again only when that changes. */
export const candidatesKey = (candidates: readonly StaticThemeCandidate[] | undefined): string =>
  candidates ? candidates.map(({ classes, refs }) => `${classes}|${refs.join()}`).join('\n') : ''

/** How often {@link checkCandidatesAfterCommit} looks again for an element not committed yet. */
const COMMIT_RETRIES = 10
/** The wait between those looks, about a frame. */
const COMMIT_RETRY_MS = 16

/**
 * How often it looks again, past {@link COMMIT_RETRIES}, for an element in the
 * server's markup that React has not hydrated: about two seconds more, as a
 * development build hydrates a large page in more than a few frames. A
 * hydration slower than that, on a slow device, warns again: a bound chosen
 * for a development-only check.
 */
const HYDRATION_RETRIES = 125
/** The candidates each committed element was checked for, so a later render of the same element does not check it again. */
let checkedElements = new WeakMap<Element, Set<string>>()

/**
 * Checks candidates once their elements are committed, from a walk, which has
 * no effect of its own to run after commit: on the next task, and again about a
 * frame later for a candidate none of whose elements is in the document yet, as
 * a render React interrupts commits later. An element in the server's markup
 * that React has not hydrated is looked at again for longer, until React
 * hydrates it. Development only, in the browser.
 * @param candidates The walk's candidates.
 */
export function checkCandidatesAfterCommit(candidates: readonly StaticThemeCandidate[]): void {
  const look = (pending: readonly StaticThemeCandidate[], attempt: number) =>
    setTimeout(
      () => {
        const last = attempt === COMMIT_RETRIES + HYDRATION_RETRIES
        const inDocument = pending.filter(({ classes }) => document.getElementsByClassName(classes.split(' ')[0]).length > 0)
        const unhydrated = inDocument.length > 0 ? checkCandidates(inDocument, checkedElements, last) : []
        const absent = attempt < COMMIT_RETRIES ? pending.filter(candidate => !inDocument.includes(candidate)) : []
        const next = [...absent, ...unhydrated]
        if (next.length > 0 && !last) look(next, attempt + 1)
      },
      attempt === 1 ? 0 : COMMIT_RETRY_MS,
    )
  look(candidates, 1)
}

/** Test seam: forgets which elements were checked. */
export const __resetCheckedCandidates = (): void => void (checkedElements = new WeakMap())
