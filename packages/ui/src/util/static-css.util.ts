import { isDevMode } from '@src/constant/common.const.js'
import { getGlobalState } from '@src/helper/common.helper.js'

/**
 * The css rules the compiler extracted at build time, and how they reach the page.
 *
 * Compiled output registers each module's rules once, at module evaluation, with
 * {@link registerStaticCss}. A rule belongs to one of four buckets, and every
 * rule of a bucket comes after every rule of the buckets before it, across all
 * modules, so a later module's base declaration can never beat an earlier
 * module's at-rule. All of them come before Emotion's rules, so a runtime rule
 * wins a tie against a static one.
 *
 * - In the browser, each bucket is one `<style data-meonode-static>`. In
 *   production it is filled through the CSSOM, as Emotion fills its sheets
 *   there, which a hash-based Content Security Policy permits where new style
 *   text would be blocked. In development the rules go in as text, as Emotion's
 *   do, so the browser's tools show and edit them.
 * - On the server, a render emits each module it uses as React hoistable styles,
 *   one per bucket, in four precedences that React creates in bucket order. React
 *   dedupes them by `href` within a request and hoists them into the head.
 * - When the browser takes over a server-rendered page, it reads which modules
 *   the server sent from those styles' `data-href` and inserts none of them again.
 *
 * Everything kept is per module or per class name, so it is bounded by the code
 * that was built. Nothing is kept per render or per request.
 */

/** How many buckets the rules fall into: base declarations, pseudo-classes, at-rules and per-node selectors. */
export const STATIC_CSS_BUCKETS = 4

/** One extracted rule: its bucket, the class it defines, and its css text. */
export type StaticCssRule = readonly [bucket: number, className: string, cssText: string]

/** Prefix of every `href` and precedence the server's static styles use. */
export const STATIC_CSS_PREFIX = 'mn-static-'

/**
 * The most distinct `__meo$s` strings whose modules the server remembers. A
 * conditional class list has one string per combination, so the count is bounded
 * by the code; the cap bounds it anyway, at a few hundred kilobytes.
 */
export const STATIC_CLASS_LIST_MEMO_ENTRIES = 10_000

/** A registered module: its rules' text per bucket. */
interface StaticModule {
  texts: string[]
}

interface StaticCssState {
  /** Text of every registered class, by name. */
  rules: Map<string, string>
  /** The first module that registered each class. */
  moduleOf: Map<string, string>
  /** Every registered module, by id. */
  modules: Map<string, StaticModule>
  /** The bucket elements in the browser, created on the first insertion. */
  sheets: HTMLStyleElement[] | undefined
  /** Modules the server already sent with this page, read once in the browser. */
  adopted: Set<string> | undefined
  /** Module ids per `__meo$s` string, on the server. */
  listModules: Map<string, readonly string[]>
}

const state = getGlobalState(Symbol.for('@meonode/ui/staticCss'), (): StaticCssState => ({
  rules: new Map(),
  moduleOf: new Map(),
  modules: new Map(),
  sheets: undefined,
  adopted: undefined,
  listModules: new Map(),
}))

/** Whether rules go in through the CSSOM rather than as text: in production, as with Emotion. */
let speedy = !isDevMode()

/** Whether any rule is registered. Until one is, nothing here costs a render anything, and a server render sends nothing for it. */
export const hasStaticCss = (): boolean => state.rules.size > 0

/** The registered text of a static class, or `undefined` when none is registered. */
export const staticRuleOf = (className: string): string | undefined => state.rules.get(className)

/** The precedence of a bucket's hoistable styles. */
export const staticPrecedence = (bucket: number): string => `${STATIC_CSS_PREFIX}${bucket}`

/** The `href` of a module's hoistable style for a bucket. */
export const staticHref = (moduleId: string, bucket: number): string => `${STATIC_CSS_PREFIX}${moduleId}-${bucket}`

/**
 * Registers a module's extracted rules. Compiled output calls this once per
 * module, at its top level.
 *
 * A class registered by an earlier module keeps that module's rule, and in the
 * browser is not inserted again. A class whose text differs from the one already
 * registered means two builds are mixed, and in development throws.
 * @param moduleId A hash of the module's rules, so the same rules register once.
 * @param rules The module's rules, each as `[bucket, className, cssText]`.
 */
export function registerStaticCss(moduleId: string, rules: readonly StaticCssRule[]): void {
  if (state.modules.has(moduleId)) return
  const inBrowser = typeof document !== 'undefined'
  const adopted = inBrowser && adoptedModules().has(moduleId)
  const texts = Array.from({ length: STATIC_CSS_BUCKETS }, () => '')
  const fresh: string[][] | undefined = inBrowser && !adopted ? Array.from({ length: STATIC_CSS_BUCKETS }, () => []) : undefined
  for (const [bucket, className, cssText] of rules) {
    if (!Number.isInteger(bucket) || bucket < 0 || bucket >= STATIC_CSS_BUCKETS) {
      if (isDevMode()) throw new Error(`[MeoNode] Static css for \`${className}\` names bucket ${bucket}; buckets are 0 to ${STATIC_CSS_BUCKETS - 1}.`)
      continue
    }
    const known = state.rules.get(className)
    if (known === undefined) {
      state.rules.set(className, cssText)
      state.moduleOf.set(className, moduleId)
      fresh?.[bucket].push(cssText)
    } else if (known !== cssText && isDevMode()) {
      throw new Error(
        `[MeoNode] The static class \`${className}\` is registered with two different rules:\n  ${known}\n  ${cssText}\nOutput of two different builds is loaded together.`,
      )
    }
    texts[bucket] += cssText
  }
  state.modules.set(moduleId, { texts })
  if (fresh) insertRules(fresh)
}

/**
 * The ids of the modules the server sent with this page, from the `data-href`
 * of the styles React hoisted. Read once, at the first registration in the
 * browser, which runs before the page hydrates.
 */
function adoptedModules(): Set<string> {
  if (state.adopted) return state.adopted
  const adopted = new Set<string>()
  for (const element of document.querySelectorAll<HTMLStyleElement>(`style[data-precedence^="${STATIC_CSS_PREFIX}"]`)) {
    for (const href of (element.getAttribute('data-href') ?? '').split(' ')) {
      if (!href.startsWith(STATIC_CSS_PREFIX)) continue
      const bucketAt = href.lastIndexOf('-')
      // A seed's href is the prefix and a bucket alone.
      if (bucketAt > STATIC_CSS_PREFIX.length) adopted.add(href.slice(STATIC_CSS_PREFIX.length, bucketAt))
    }
  }
  state.adopted = adopted
  return adopted
}

/**
 * The bucket sheets, created on the first insertion. Each goes right after the
 * server's styles of its bucket, so the server's rules and the browser's keep
 * one bucket order. On a page the server did not render, they go together before
 * the first Emotion sheet, or at the end of the head when there is none yet:
 * Emotion appends its own after them.
 */
function bucketSheets(): HTMLStyleElement[] {
  if (state.sheets) return state.sheets
  const head = document.head
  const emotion = head.querySelector('style[data-emotion]')
  const sheets: HTMLStyleElement[] = []
  for (let bucket = 0; bucket < STATIC_CSS_BUCKETS; bucket++) {
    const element = document.createElement('style')
    element.setAttribute('data-meonode-static', String(bucket))
    const server = head.querySelectorAll(`style[data-precedence="${staticPrecedence(bucket)}"]`)
    const after = server.length > 0 ? server[server.length - 1] : undefined
    if (after) after.after(element)
    else if (emotion) emotion.before(element)
    else head.append(element)
    sheets.push(element)
  }
  state.sheets = sheets
  return sheets
}

/** Inserts rules at the end of their buckets' sheets. */
function insertRules(byBucket: string[][]): void {
  let sheets: HTMLStyleElement[] | undefined
  for (let bucket = 0; bucket < STATIC_CSS_BUCKETS; bucket++) {
    if (byBucket[bucket].length === 0) continue
    sheets ??= bucketSheets()
    const element = sheets[bucket]
    if (speedy) {
      const sheet = element.sheet as CSSStyleSheet
      for (const cssText of byBucket[bucket]) for (const rule of splitRules(cssText)) insertRule(sheet, rule)
    } else element.appendChild(document.createTextNode(byBucket[bucket].join('')))
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

/**
 * The modules whose rules a `__meo$s` class list needs, on the server.
 * @returns Module ids, in the order their classes appear.
 */
export function modulesOfClasses(classes: string): readonly string[] {
  const known = state.listModules.get(classes)
  if (known) return known
  const modules: string[] = []
  for (const className of classes.split(' ')) {
    if (className === '') continue
    const moduleId = state.moduleOf.get(className)
    if (moduleId === undefined) {
      if (isDevMode()) console.error(`[MeoNode] The static class \`${className}\` is used but no module registered it, so the server sends no rule for it.`)
    } else if (!modules.includes(moduleId)) modules.push(moduleId)
  }
  if (state.listModules.size >= STATIC_CLASS_LIST_MEMO_ENTRIES) state.listModules.clear()
  state.listModules.set(classes, modules)
  return modules
}

/** A registered module's rule text for each bucket, or `undefined` for an id never registered. */
export const staticModuleTexts = (moduleId: string): readonly string[] | undefined => state.modules.get(moduleId)?.texts

/** Test seam: forgets every registration, the browser sheets and what was adopted. */
export function __resetStaticCss(): void {
  for (const element of state.sheets ?? []) element.remove()
  state.rules.clear()
  state.moduleOf.clear()
  state.modules.clear()
  state.listModules.clear()
  state.sheets = undefined
  state.adopted = undefined
}

/** Test seam: inserts through the CSSOM when `true`, as text when `false`, or as the build decides when given nothing. */
export const __setStaticCssSpeedy = (value?: boolean): void => {
  speedy = value ?? !isDevMode()
}

/** Test seam: how many class lists the server remembers. */
export const __staticClassListMemoSize = (): number => state.listModules.size
