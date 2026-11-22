import { isDevMode, RUNTIME_PRECEDENCE } from '@src/constant/common.const.js'
import { getGlobalState } from '@src/helper/common.helper.js'

/**
 * The css rules the compiler extracted at build time, and how they reach the page.
 *
 * Compiled output registers each module's rules once, at module evaluation, with
 * {@link registerStaticCss}. That only records them: a rule reaches the page when
 * a node that uses its class first renders, as Emotion's do, through the
 * `StaticStyles` of that node's render.
 *
 * A rule belongs to one of five buckets, and every rule of a bucket comes after
 * every rule of the buckets before it. Within a bucket, rules come in the order
 * they reached the page, which follows the render's order, parents first, as
 * Emotion's do. A rule that styles another node's element ties with that node's
 * own rules as Emotion's would: Emotion inserts by render order, so a rule for a
 * descendant or a later sibling (forward) loses to the target's own rules, and
 * one for an ancestor or an earlier sibling through `:has()` (backward) wins.
 * Forward rules therefore come first, and backward ones with the node's own
 * selector rules last; see {@link STATIC_CSS_BUCKETS}.
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
 *   in five precedences that React creates in bucket order. React dedupes them by
 *   `href` within a request and hoists them into the head.
 * - When the browser takes over a server-rendered page, it reads which classes
 *   the server sent from those styles' `data-href` and inserts none of them again.
 *
 * Everything kept is per module, per class name or per container, so it is
 * bounded by the code that was built and the page's containers. Nothing is kept
 * per render or per request.
 */

/**
 * How many buckets the rules fall into, in this order:
 * 0. forward rules, which style a descendant or a later sibling of the node (`& .x`, `& > *`, `& + .x`);
 * 1. base declarations;
 * 2. pseudo-classes;
 * 3. at-rules;
 * 4. the node's own selector rules (`.wrapper &`, `&.x`), and backward rules, which style an ancestor or an earlier sibling (`.x:has(&)`).
 */
export const STATIC_CSS_BUCKETS = 5

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
  /** Classes the server already sent with this page, read at the first insertion in the browser and as streamed boundaries bring more. */
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
 * React hoisted. Read at the first insertion in the browser, during the page's
 * first commit; a boundary streamed later brings its own, which
 * {@link sentLater} finds.
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
 * Whether the server sent `className` in a style that arrived after the first
 * read: a Suspense boundary streamed later carries its hoistables in its own
 * chunk, which React's streaming runtime puts beside the styles of the same
 * precedence, in the head once the first insertion moved those there, or at its
 * start with none. The boundary hydrates after that, so its classes are found
 * there by the time its nodes insert them.
 * @param head The document head.
 * @param className A class not inserted in the head's sheets yet.
 * @returns Whether it is on the page, now among the adopted classes if so.
 */
function sentLater(head: HTMLHeadElement, className: string): boolean {
  if (head.querySelector(`style[data-precedence^="${STATIC_CSS_PREFIX}"][data-href~="${staticHref(className)}"]`) === null) return false
  state.adopted!.add(className)
  return true
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
 * In the document head of a page the server rendered, the server's styles for
 * the buckets first move to where the cache's rules are, from the head or, for a
 * page rendered as a fragment, from the body, as Emotion moves its own, and each bucket's sheet
 * goes right after the server's styles of that bucket, so the server's rules and
 * the browser's keep one bucket order. Otherwise the five go together right before
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
  // Wherever React left them, as `adoptedClasses` reads them: in the head, or in
  // the body for a page rendered as a fragment, where React cannot hoist.
  const serverGroups =
    container === head
      ? Array.from({ length: STATIC_CSS_BUCKETS }, (_, bucket) => ownerDocument.querySelectorAll(`style[data-precedence="${staticPrecedence(bucket)}"]`))
      : undefined
  const afterServer = serverGroups?.some(group => group.length > 0) ?? false
  // Before MeoNode's runtime rules wherever they come first: the cache's, or
  // those React hoisted for server components.
  const before = earlier(placementOf(sheet, container), container === head ? head.querySelector(`style[data-precedence="${RUNTIME_PRECEDENCE}"]`) : null)
  if (afterServer && !known) placeServerGroups(serverGroups!, container, before)

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

/** Of two places to insert before, the one earlier in the document; `null` is the end. */
function earlier(a: Node | null, b: Node | null): Node | null {
  if (a === null) return b
  if (b === null) return a
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? b : a
}

/**
 * Moves the styles the server hoisted for the static buckets, in bucket order,
 * to right before `before`: where MeoNode's runtime rules are once the page
 * hydrates, the cache's or those React hoisted for server components.
 * The page's own stylesheets can come between the two in the server's head, and
 * a cache that prepends moves its server styles to the head's start on
 * hydration, so without this a tie between a static rule and the page's would
 * go the other way from the same rule in Emotion's sheet. A page rendered as a
 * fragment has them in the body, where React leaves the styles it cannot hoist
 * and from where Emotion moves its own into the head, after the page's stylesheets
 * or ahead of them; left there, a static rule would win a tie against a runtime
 * rule inserted after it, and lose one against the page's stylesheet ahead of
 * a cache that prepends.
 */
function placeServerGroups(groups: readonly NodeListOf<Element>[], container: Node, before: Node | null): void {
  const own = new Set<Node>(groups.flatMap(group => [...group]))
  let anchor = before
  while (anchor && own.has(anchor)) anchor = anchor.nextSibling
  for (const group of groups) for (const element of group) container.insertBefore(element, anchor)
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
  if (container !== document.head) return insertInto(target, classNames)
  const adopted = adoptedClasses()
  const head = document.head
  insertInto(
    target,
    classNames.filter(className => !adopted.has(className) && (target.inserted.has(className) || !sentLater(head, className))),
  )
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

/** Char codes the rule splitter reads. */
const BACKSLASH = 92
const DOUBLE_QUOTE = 34
const SINGLE_QUOTE = 39
const SLASH = 47
const STAR = 42
const OPEN_BRACE = 123
const CLOSE_BRACE = 125
const SEMICOLON = 59
const CLOSE_PAREN = 41
const NEWLINE = 10

/** Whether a char code continues a CSS identifier, so `url(` after it is a function, not a url token. */
const isNameCode = (code: number) =>
  (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 45 || code === 95 || code >= 128

/**
 * The top-level rules in a css text, for `insertRule`, which takes one at a
 * time. It reads the text as CSS tokenizes it: a brace or semicolon inside a
 * string, an unquoted `url(...)`, a comment or after a backslash is not a
 * boundary; a rule ends at its block's closing brace, a statement such as
 * `@layer a, b;` at its semicolon. A trailing remainder is kept, so a broken
 * rule reaches the browser and is rejected there, as in a stylesheet.
 */
export function splitRules(cssText: string): string[] {
  const rules: string[] = []
  const length = cssText.length
  let depth = 0
  let start = 0
  const end = (at: number) => {
    const rule = cssText.slice(start, at)
    if (rule.trim() !== '') rules.push(rule)
    start = at
  }
  for (let i = 0; i < length; i++) {
    const code = cssText.charCodeAt(i)
    if (code === BACKSLASH) i++
    else if (code === DOUBLE_QUOTE || code === SINGLE_QUOTE) {
      // A string runs to its closing quote; a raw newline ends a bad string.
      for (i++; i < length; i++) {
        const next = cssText.charCodeAt(i)
        if (next === BACKSLASH) i++
        else if (next === code || next === NEWLINE) break
      }
    } else if (code === SLASH && cssText.charCodeAt(i + 1) === STAR) {
      const close = cssText.indexOf('*/', i + 2)
      i = close === -1 ? length : close + 1
    } else if ((code | 32) === 117 /* u */ && !isNameCode(cssText.charCodeAt(i - 1)) && cssText.slice(i + 1, i + 4).toLowerCase() === 'rl(') {
      // An unquoted url token runs to its closing parenthesis; a quoted one is a
      // string, read on the next pass.
      let j = i + 4
      while (j < length && /\s/.test(cssText[j]!)) j++
      const first = cssText.charCodeAt(j)
      if (first === DOUBLE_QUOTE || first === SINGLE_QUOTE) i = j - 1
      else {
        for (i = j; i < length; i++) {
          const next = cssText.charCodeAt(i)
          if (next === BACKSLASH) i++
          else if (next === CLOSE_PAREN) break
        }
      }
    } else if (code === OPEN_BRACE) depth++
    else if (code === CLOSE_BRACE) {
      if (depth > 0 && --depth === 0) end(i + 1)
    } else if (code === SEMICOLON && depth === 0) end(i + 1)
  }
  end(length)
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
