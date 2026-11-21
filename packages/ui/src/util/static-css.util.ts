import { isDevMode } from '@src/constant/common.const.js'
import { getGlobalState } from '@src/helper/common.helper.js'

/**
 * The css rules the compiler extracted at build time, and how they reach the page.
 *
 * Compiled output registers each module's rules once, at module evaluation, with
 * {@link registerStaticCss}. That only records them: a rule reaches the page when
 * a node that uses its class first renders, as Emotion's do, through the
 * `StaticStyles` of that node's render.
 *
 * A rule belongs to one of four buckets, and every rule of a bucket comes after
 * every rule of the buckets before it. Within a bucket, rules come in the order
 * they reached the page.
 *
 * - In the browser, each bucket is one `<style data-meonode-static>` per
 *   container, placed right before the tags of the Emotion cache MeoNode's own
 *   rules go into, so a runtime rule wins a tie against a static one and both
 *   keep their place against the page's other styles; see {@link insertStaticClasses}.
 *   In production a sheet is filled through the CSSOM, as Emotion fills its
 *   sheets there, which a hash-based Content Security Policy permits where new
 *   style text would be blocked. In development the rules go in as text, as
 *   Emotion's do, so the browser's tools show and edit them.
 * - On the server, a render emits each class it uses as a React hoistable style,
 *   in four precedences that React creates in bucket order. React dedupes them by
 *   `href` within a request and hoists them into the head.
 * - When the browser takes over a server-rendered page, it reads which classes
 *   the server sent from those styles' `data-href` and inserts none of them again.
 *
 * Everything kept is per module, per class name or per container, so it is
 * bounded by the code that was built and the page's containers. Nothing is kept
 * per render or per request.
 */

/** How many buckets the rules fall into: base declarations, pseudo-classes, at-rules and per-node selectors. */
export const STATIC_CSS_BUCKETS = 4

/** One extracted rule: its bucket, the class it defines, and its css text. */
export type StaticCssRule = readonly [bucket: number, className: string, cssText: string]

/** Prefix of every `href` and precedence the server's static styles use. */
export const STATIC_CSS_PREFIX = 'mn-static-'

/**
 * The most distinct `__meo$s` strings whose registered classes are remembered. A
 * conditional class list has one string per combination, so the count is bounded
 * by the code; the cap bounds it anyway, at a few hundred kilobytes.
 */
export const STATIC_CLASS_LIST_MEMO_ENTRIES = 10_000

/** A registered class: its bucket and its css text. */
interface StaticClass {
  bucket: number
  cssText: string
}

/**
 * The part of an Emotion cache's sheet that decides where its tags go, as
 * `@emotion/sheet` reads it in `_insertTag` when the sheet has no tags yet:
 * after `insertionPoint`, else at the start of `container` with `prepend`, else
 * before `before`. {@link insertStaticClasses} reads it and, while the sheet has
 * no tags, may set `insertionPoint`.
 */
export interface EmotionSheetPlacement {
  container: Node
  tags: readonly Element[]
  prepend?: boolean
  insertionPoint?: Element
  before: Node | null
}

/** The static sheets of one container, and the classes inserted into them. */
interface StaticTarget {
  sheets: HTMLStyleElement[]
  inserted: Set<string>
  /** The cache sheet the sheets were last placed for. */
  placedFor: EmotionSheetPlacement | undefined
}

interface StaticCssState {
  /** Every registered class, by name. */
  classes: Map<string, StaticClass>
  /** Every registered module id. */
  modules: Set<string>
  /** The registered classes of a `__meo$s` string, in its order. */
  lists: Map<string, readonly string[]>
  /** The browser's static sheets, per container. */
  targets: Map<Node, StaticTarget>
  /** Classes the server already sent with this page, read once in the browser. */
  adopted: Set<string> | undefined
  /** The `insertionPoint` set on each cache sheet here, to tell it from one the app set. */
  ownInsertionPoints: WeakMap<object, Element>
}

const state = getGlobalState(Symbol.for('@meonode/ui/staticCss'), (): StaticCssState => ({
  classes: new Map(),
  modules: new Set(),
  lists: new Map(),
  targets: new Map(),
  adopted: undefined,
  ownInsertionPoints: new WeakMap(),
}))

/** Whether rules go in through the CSSOM rather than as text: in production, as with Emotion. */
let speedy = !isDevMode()

/** Whether any rule is registered. Until one is, nothing here costs a render anything, and a server render sends nothing for it. */
export const hasStaticCss = (): boolean => state.classes.size > 0

/** The registered text of a static class, or `undefined` when none is registered. */
export const staticRuleOf = (className: string): string | undefined => state.classes.get(className)?.cssText

/** The registered bucket of a static class, or `undefined` when none is registered. */
export const staticBucketOf = (className: string): number | undefined => state.classes.get(className)?.bucket

/** The precedence of a bucket's hoistable styles. */
export const staticPrecedence = (bucket: number): string => `${STATIC_CSS_PREFIX}${bucket}`

/** The `href` of a class's hoistable style. */
export const staticHref = (className: string): string => `${STATIC_CSS_PREFIX}${className}`

/**
 * Registers a module's extracted rules. Compiled output calls this once per
 * module, at its top level. Nothing reaches the page until a node using a class
 * renders.
 *
 * A class registered by an earlier module keeps that module's rule: the same
 * node style in two modules is one class. A class whose text differs from the one
 * already registered means two builds are mixed, and in development throws.
 * @param moduleId A hash of the module's rules, so the same rules register once.
 * @param rules The module's rules, each as `[bucket, className, cssText]`.
 */
export function registerStaticCss(moduleId: string, rules: readonly StaticCssRule[]): void {
  if (state.modules.has(moduleId)) return
  for (const [bucket, className, cssText] of rules) {
    if (!Number.isInteger(bucket) || bucket < 0 || bucket >= STATIC_CSS_BUCKETS) {
      if (isDevMode()) throw new Error(`[MeoNode] Static css for \`${className}\` names bucket ${bucket}; buckets are 0 to ${STATIC_CSS_BUCKETS - 1}.`)
      continue
    }
    const known = state.classes.get(className)
    if (known === undefined) state.classes.set(className, { bucket, cssText })
    else if (known.cssText !== cssText && isDevMode()) {
      throw new Error(
        `[MeoNode] The static class \`${className}\` is registered with two different rules:\n  ${known.cssText}\n  ${cssText}\nOutput of two different builds is loaded together.`,
      )
    }
  }
  state.modules.add(moduleId)
}

/**
 * The registered classes of a `__meo$s` string, in its order. A class no module
 * registered is reported in development and left out.
 * @param classes A node's static classes.
 * @returns The registered ones.
 */
export function registeredClassesOf(classes: string): readonly string[] {
  const known = state.lists.get(classes)
  if (known) return known
  const found: string[] = []
  for (const className of classes.split(' ')) {
    if (className === '') continue
    if (state.classes.has(className)) found.push(className)
    else if (isDevMode()) console.error(`[MeoNode] The static class \`${className}\` is used but no module registered it, so no rule is sent for it.`)
  }
  if (state.lists.size >= STATIC_CLASS_LIST_MEMO_ENTRIES) state.lists.clear()
  state.lists.set(classes, found)
  return found
}

/**
 * The classes the server sent with this page, from the `data-href` of the styles
 * React hoisted. Read once, at the first insertion in the browser, during the
 * page's first commit.
 */
function adoptedClasses(): Set<string> {
  if (state.adopted) return state.adopted
  const adopted = new Set<string>()
  for (const element of document.querySelectorAll<HTMLStyleElement>(`style[data-precedence^="${STATIC_CSS_PREFIX}"]`)) {
    for (const href of (element.getAttribute('data-href') ?? '').split(' ')) {
      // A seed's href is the prefix and a bucket alone; a class's is the prefix and the class.
      const className = href.slice(STATIC_CSS_PREFIX.length)
      if (href.startsWith(STATIC_CSS_PREFIX) && state.classes.has(className)) adopted.add(className)
    }
  }
  state.adopted = adopted
  return adopted
}

/**
 * The node the static sheets go before for a cache sheet: its first tag; with
 * none yet, where `@emotion/sheet` will put it.
 */
function placementOf(sheet: EmotionSheetPlacement | undefined, container: Node): Node | null {
  if (!sheet) return null
  if (sheet.tags.length > 0) return sheet.tags[0]
  const own = state.ownInsertionPoints.get(sheet)
  const insertionPoint = sheet.insertionPoint !== own ? sheet.insertionPoint : undefined
  if (insertionPoint) return insertionPoint.nextSibling
  if (sheet.prepend) return container.firstChild
  return sheet.before
}

/**
 * The static sheets of a cache's container, placed for that cache.
 *
 * In the document head of a page the server rendered, each bucket's sheet goes
 * right after the server's styles of that bucket, so the server's rules and the
 * browser's keep one bucket order. Otherwise the four go together right before
 * the cache's first tag, or, while it has none, where it will put it; then, for a
 * cache that places its first tag by `prepend` or `insertionPoint`, its
 * `insertionPoint` is set to the last static sheet, so its tags follow them.
 * `@emotion/sheet` 1.4, which `@emotion/cache` 11.14 depends on, reads
 * `insertionPoint` when it inserts a sheet's first tag, not when the cache is
 * created. A cache whose sheet already has tags is left as it is.
 *
 * A cache seen later for the same container, after a remount or a module
 * replaced in development, gets the sheets moved for it when they are not where
 * it needs them. Moving a `<style>` loses the rules inserted through the CSSOM,
 * so they go in again.
 */
function targetFor(sheet: EmotionSheetPlacement | undefined): StaticTarget {
  const container = sheet?.container ?? document.head
  const known = state.targets.get(container)
  if (known && known.placedFor === sheet) return known
  const ownerDocument = (container.ownerDocument ?? (container as Document)) as Document
  const head = ownerDocument.head
  const serverGroups =
    container === head
      ? Array.from({ length: STATIC_CSS_BUCKETS }, (_, bucket) => head.querySelectorAll(`style[data-precedence="${staticPrecedence(bucket)}"]`))
      : undefined
  const afterServer = serverGroups?.some(group => group.length > 0) ?? false
  const before = placementOf(sheet, container)

  if (known) {
    // Placed for another cache: kept when this one needs them where they are.
    known.placedFor = sheet
    if (afterServer || before === known.sheets[0] || before === known.sheets[STATIC_CSS_BUCKETS - 1].nextSibling) {
      claimInsertionPoint(sheet, known)
      return known
    }
    for (const element of known.sheets) element.remove()
  }

  const sheets: HTMLStyleElement[] = []
  for (let bucket = 0; bucket < STATIC_CSS_BUCKETS; bucket++) {
    const element = ownerDocument.createElement('style')
    element.setAttribute('data-meonode-static', String(bucket))
    const group = serverGroups?.[bucket]
    if (afterServer && group && group.length > 0) group[group.length - 1].after(element)
    else if (afterServer && bucket > 0) sheets[bucket - 1].after(element)
    else container.insertBefore(element, before)
    sheets.push(element)
  }
  const target: StaticTarget = { sheets, inserted: new Set(), placedFor: sheet }
  state.targets.set(container, target)
  // Moved: what was in the old sheets goes into the new ones, in the order it went in.
  if (known) insertInto(target, [...known.inserted])
  claimInsertionPoint(sheet, target)
  return target
}

/** Makes a cache with no tags yet put its first one after the static sheets, when it places it by `prepend` or `insertionPoint`. */
function claimInsertionPoint(sheet: EmotionSheetPlacement | undefined, target: StaticTarget): void {
  if (!sheet || sheet.tags.length > 0) return
  const own = state.ownInsertionPoints.get(sheet)
  if (!sheet.prepend && (sheet.insertionPoint === undefined || sheet.insertionPoint === own)) return
  const last = target.sheets[STATIC_CSS_BUCKETS - 1]
  sheet.insertionPoint = last
  state.ownInsertionPoints.set(sheet, last)
}

/**
 * Inserts the rules of classes into the static sheets of the container of the
 * Emotion cache MeoNode's rules go into, each class once per container, in the
 * order given, at the end of its bucket. In the document head, classes the server
 * sent are not inserted again.
 * @param sheet The Emotion cache's sheet, or `undefined` with no cache.
 * @param classNames Registered classes, in the order they should reach the page.
 */
export function insertStaticClasses(sheet: EmotionSheetPlacement | undefined, classNames: readonly string[]): void {
  if (classNames.length === 0) return
  const target = targetFor(sheet)
  const container = sheet?.container ?? document.head
  const adopted = container === document.head ? adoptedClasses() : undefined
  insertInto(target, adopted ? classNames.filter(className => !adopted.has(className)) : classNames)
}

function insertInto(target: StaticTarget, classNames: readonly string[]): void {
  const byBucket: string[][] = Array.from({ length: STATIC_CSS_BUCKETS }, () => [])
  for (const className of classNames) {
    if (target.inserted.has(className)) continue
    const known = state.classes.get(className)
    if (!known) continue
    target.inserted.add(className)
    byBucket[known.bucket].push(known.cssText)
  }
  for (let bucket = 0; bucket < STATIC_CSS_BUCKETS; bucket++) {
    if (byBucket[bucket].length === 0) continue
    const element = target.sheets[bucket]
    if (speedy) {
      const sheet = element.sheet as CSSStyleSheet
      for (const cssText of byBucket[bucket]) for (const rule of splitRules(cssText)) insertRule(sheet, rule)
    } else element.appendChild((element.ownerDocument ?? document).createTextNode(byBucket[bucket].join('')))
  }
}

function insertRule(sheet: CSSStyleSheet, rule: string): void {
  try {
    sheet.insertRule(rule, sheet.cssRules.length)
  } catch (error) {
    // A browser rejects a rule for a selector or at-rule it does not know, as
    // it would drop it from a stylesheet. Vendor-prefixed ones are expected.
    if (isDevMode() && !/:-[a-z]+-|@-[a-z]+-/.test(rule)) console.error(`[MeoNode] The browser rejected the static rule \`${rule}\`.`, error)
  }
}

/**
 * The top-level rules in a css text, for `insertRule`, which takes one at a
 * time. Extracted values never hold braces, so depth alone finds the ends.
 */
export function splitRules(cssText: string): string[] {
  const rules: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < cssText.length; i++) {
    const code = cssText.charCodeAt(i)
    if (code === 123 /* { */) depth++
    else if (code === 125 /* } */ && --depth === 0) {
      rules.push(cssText.slice(start, i + 1))
      start = i + 1
    }
  }
  return rules
}

/** Test seam: forgets every registration, the browser sheets and what was adopted. */
export function __resetStaticCss(): void {
  for (const target of state.targets.values()) for (const element of target.sheets) element.remove()
  state.classes.clear()
  state.modules.clear()
  state.lists.clear()
  state.targets.clear()
  state.adopted = undefined
  state.ownInsertionPoints = new WeakMap()
}

/** Test seam: inserts through the CSSOM when `true`, as text when `false`, or as the build decides when given nothing. */
export const __setStaticCssSpeedy = (value?: boolean): void => {
  speedy = value ?? !isDevMode()
}

/** Test seam: how many class lists are remembered. */
export const __staticClassListMemoSize = (): number => state.lists.size
