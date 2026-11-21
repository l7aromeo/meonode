import { __DEBUG__, isDevMode, refreshDevMode } from '@src/constant/common.const.js'
import type { Theme } from '@src/types/node.type.js'
import { toLengthVarName, wouldEmotionAddPx as emotionWouldAddPx } from '@src/util/css-unit.util.js'
import { IS_REACT_SERVER_LAYER } from '@src/util/react-layer.util.js'

/**
 * Development-time diagnostics for `theme.*` tokens.
 *
 * Token resolution is deliberately forgiving: a path that resolves to nothing
 * still emits `var(--meonode-theme-…)`, and the browser drops the declaration.
 * That stops one bad token from taking down a page, but it also means the
 * common authoring mistakes produce no error, no warning, and no visible
 * effect — an element is simply missing a style, with nothing to search for.
 *
 * These checks close that gap without changing a single byte of emitted CSS.
 *
 * They run against the **variables the theme actually defines** rather than
 * re-parsing token paths. Tokens reach here in two shapes depending on the
 * path taken — `theme.spacing.md` on the client, `var(--meonode-theme-spacing-md)`
 * once `replaceThemeTokensWithCssVars` has run — and a variable name cannot be
 * reversed back into a path unambiguously (a theme key may itself contain `-`).
 * Membership in the defined set answers the question exactly, either way.
 */

/**
 * Diagnostics run in development, or whenever debug mode is on. Shared by every
 * one of them, so "are warnings on?" has a single definition rather than one per
 * call site.
 *
 * `NODE_ENV` is read defensively, since browser bundles may not define
 * `process`. A bundler that substitutes the expression folds the development
 * half to `false`, but it does not remove the call or the messages behind it: in
 * a minified bundle with `process.env.NODE_ENV` defined, this stays a runtime
 * call and the diagnostic strings ship. That is
 * deliberate — it is what lets `setDebugMode(true)` work in production.
 * @returns `true` when diagnostics should be evaluated.
 */
export const diagnosticsEnabled = (): boolean => __DEBUG__ || isDevMode()

/**
 * Resolution runs once per styled node per render, so an unguarded warning
 * would fire thousands of times for a single mistake. Each distinct
 * `subject|property` pair is reported once per process.
 */
const reported = new Set<string>()

/** Objects already reported by {@link reportReservedStylesKey}; held weakly, as a style object can be a render's literal. */
let reportedReservedOwners = new WeakSet<object>()

/**
 * Warns once per key.
 * @param seenKey What makes this report distinct.
 * @param message The text after the `[MeoNode]` tag.
 */
const report = (seenKey: string, message: string): void => {
  if (reported.has(seenKey)) return
  reported.add(seenKey)
  console.warn(`[MeoNode] ${message}`)
}

/**
 * Whether Emotion would have appended `px` to this number had it been written
 * directly as a prop — which is exactly the condition that makes a bare numeric
 * token wrong.
 *
 * Mirrors `@emotion/serialize`'s `processStyleValue` so the two cannot disagree:
 *
 * ```js
 * unitless[key] !== 1 && !isCustomProperty(key) && typeof value === 'number' && value !== 0
 * ```
 *
 * The `0` and custom-property cases matter. `padding: 0` is valid CSS and
 * Emotion leaves it bare, and a `--custom-property` declaration takes a raw
 * number quite legitimately. Warning on either would be a false positive.
 * @param property The CSS property the value was written against.
 * @param value The number the token holds.
 * @returns `true` when a bare number here produces an invalid declaration.
 */
const wouldEmotionAddPx = (property: string, value: number): boolean => emotionWouldAddPx(property) && value !== 0

/** A string that is only a number — `'16'`, `'-2'`, `'1.5'` — with no unit. */
const UNITLESS_NUMERIC_STRING = /^-?(?:\d+\.?\d*|\.\d+)$/

/**
 * Whether this value produces an invalid declaration for this property.
 *
 * Emotion adds `px` on `typeof value === 'number'`, so a *string* that merely
 * looks numeric slips through untouched — `padding: '16'` serialises to
 * `padding:16`, which is not a valid length and is dropped. Theme tokens hit
 * the same wall from the other side: their value reaches CSS through a custom
 * property, and a custom property's value is opaque text that Emotion never
 * inspects, so a bare `16` stays bare whether it was written as a number or a
 * string.
 * @param property The CSS property the value was written against.
 * @param value The value as it will reach CSS.
 * @returns `true` when the declaration will be discarded for want of a unit.
 */
const isUnitlessLength = (property: string, value: unknown): boolean => {
  if (typeof value === 'number') return wouldEmotionAddPx(property, value)
  if (typeof value !== 'string' || !UNITLESS_NUMERIC_STRING.test(value)) return false
  return wouldEmotionAddPx(property, Number(value))
}

/** Human-readable token path for a variable name, for message text only. */
const toReadablePath = (varName: string): string => `theme.${varName.replace('--meonode-theme-', '').replace(/-/g, '.')}`

const toVarName = (path: string): string => `--meonode-theme-${path.replace(/[^\w.-]/g, '-').replace(/\./g, '-')}`

/**
 * Every variable a theme defines, mapped to its raw value.
 *
 * Mirrors `buildThemeVariablesCss`'s traversal exactly — a nested object
 * contributes a variable only when it carries a scalar `default` — because a
 * disagreement between the two would make this report variables that were never
 * emitted, or miss ones that were.
 */
const buildThemeVarIndex = (theme: Theme): Map<string, unknown> => {
  const index = new Map<string, unknown>()
  const system = theme?.system
  if (!system || typeof system !== 'object') return index

  const stack: Array<{ path: string; value: unknown }> = [{ path: '', value: system }]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || !current.value || typeof current.value !== 'object') continue

    for (const [key, rawValue] of Object.entries(current.value as Record<string, unknown>)) {
      const path = current.path ? `${current.path}.${key}` : key
      if (rawValue === null || rawValue === undefined) continue

      if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
        index.set(toVarName(path), rawValue)
        continue
      }
      if (typeof rawValue === 'object') {
        const maybeDefault = (rawValue as Record<string, unknown>).default
        if (typeof maybeDefault === 'string' || typeof maybeDefault === 'number' || typeof maybeDefault === 'boolean') {
          index.set(toVarName(path), maybeDefault)
        }
        stack.push({ path, value: rawValue })
      }
    }
  }
  return index
}

/**
 * The variables defined where an element renders, mapped to their raw values:
 * those of every ThemeProvider above it, the nearest one's value winning for a
 * name several define.
 *
 * Every provider declares its variables on `:root`, so a variable an outer
 * provider defines resolves under a nested one too. Checking against the nearest
 * provider alone would report such a token although it renders.
 */
export type ThemeVarIndex = ReadonlyMap<string, unknown>

/** One index per theme object, rebuilt only when the theme identity changes. */
const varIndexCache = new WeakMap<object, Map<string, unknown>>()

/**
 * Every variable a theme defines.
 * @param theme The theme.
 * @returns Its variables, mapped to their raw values.
 */
export const getThemeVarIndex = (theme: Theme): ThemeVarIndex => {
  const cached = varIndexCache.get(theme as unknown as object)
  if (cached) return cached
  const index = buildThemeVarIndex(theme)
  varIndexCache.set(theme as unknown as object, index)
  return index
}

/** The variable-name ending of a token's `default` leaf, which names the same token as its parent. */
const DEFAULT_SUFFIX = '-default'

/**
 * The variables defined under a nested provider: the outer ones, with the
 * nested provider's own on top.
 *
 * Reports each token the nested provider gives another value than a provider
 * above. Providers declare their tokens on `:root` rather than on their subtree,
 * so whichever declaration comes later in the document applies to the whole
 * page, inside and outside the nested provider. Reported once per token. Only
 * called while diagnostics are on.
 * @param outer What the providers above define, or `null` when there are none.
 * @param own What this provider defines.
 * @returns Both, merged.
 */
export const mergeThemeVarIndexes = (outer: ThemeVarIndex | null, own: ThemeVarIndex): ThemeVarIndex => {
  if (!outer || outer.size === 0) return own
  const merged = new Map(outer)
  for (const [varName, value] of own) {
    const above = merged.get(varName)
    merged.set(varName, value)
    // `primary: { default: … }` defines `theme.primary` and `theme.primary.default`
    // with one value; the token is reported once, by its shorter name.
    if (
      !outer.has(varName) ||
      Object.is(above, value) ||
      (varName.endsWith(DEFAULT_SUFFIX) && Object.is(own.get(varName.slice(0, -DEFAULT_SUFFIX.length)), value))
    )
      continue
    report(
      `redefined:${varName}`,
      `A nested ThemeProvider gives ${toReadablePath(varName)} the value ${JSON.stringify(value)}, but a ThemeProvider above it already gives it ${JSON.stringify(above)}. ` +
        'Tokens are declared on :root, so whichever comes later applies to the whole page. Give the nested token a name of its own.',
    )
  }
  return merged
}

/**
 * Suggests the defined variables that share a prefix with an undefined one —
 * which is exactly what an author sees when they point at a grouping object
 * (`theme.brand`) instead of one of its leaves.
 */
const siblingsOf = (varName: string, index: ThemeVarIndex): string[] => {
  const prefix = `${varName}-`
  const out: string[] = []
  for (const name of index.keys()) {
    if (name.startsWith(prefix)) out.push(toReadablePath(name))
    if (out.length === 6) break
  }
  return out
}

const VAR_REF = /var\(\s*(--meonode-theme-[\w-]+)/g

/**
 * Reports one variable reference that will not produce a style.
 * @param varName The referenced custom property.
 * @param property The CSS property it was written against, when known.
 * @param index The variables defined where it renders, or `null` when no ThemeProvider is above it.
 */
const checkVarReference = (varName: string, property: string | undefined, index: ThemeVarIndex | null): void => {
  // `var(--x--len, var(--x))` deliberately references a variant that only exists
  // for numeric tokens; the fallback handles every other case. Reporting the
  // absent variant would flag correct code, so only the plain name is checked.
  if (varName.endsWith(toLengthVarName(''))) return

  if (index && index.has(varName)) return
  const siblings = index ? siblingsOf(varName, index) : []
  report(
    property ? `${varName}|${property}` : varName,
    `${toReadablePath(varName)}${property ? ` (used for \`${property}\`)` : ''} ${index ? 'is not defined by the active theme' : 'is used with no ThemeProvider above it'}. ` +
      `It emits var(${varName}), which no :root rule declares, so the browser drops that declaration. ` +
      (!index
        ? 'Render it inside a ThemeProvider whose tokens define it.'
        : siblings.length
          ? `Did you mean one of: ${siblings.join(', ')}?`
          : 'Check the token path against your theme.'),
  )
}

/**
 * Reports a value written straight onto a style prop that will not survive as a
 * length. Separate from the token path because nothing resolves it — it goes
 * from the call site to Emotion unchanged.
 * @param property The CSS property.
 * @param value The literal value written.
 */
const checkLiteralValue = (property: string, value: unknown): void => {
  // Only strings. A real number here is exactly the case Emotion handles — it
  // adds `px` itself — so warning on it would be wrong. The number case is only
  // a problem when it arrives through a custom property, which the token path
  // covers.
  if (typeof value !== 'string' || !isUnitlessLength(property, value)) return
  report(
    `literal:${property}:${String(value)}`,
    `\`${property}: ${JSON.stringify(value)}\` is a number written as a string, so Emotion does not add \`px\` to it — ` +
      `it only does that for real numbers. This emits \`${property}: ${value}\`, which is not a valid length and is dropped. ` +
      `Write it as ${value} or '${value}px'.`,
  )
}

/**
 * Media features whose value is a **length**, so a bare number is invalid.
 *
 * Deliberately not "any unitless number in a media feature": several features
 * legitimately take one (`monochrome: 0`, `min-color: 8`, `color-index: 256`,
 * `grid: 1`), and flagging those would be wrong.
 */
const LENGTH_MEDIA_FEATURES = /\(\s*(?:min-|max-)?(?:width|height|device-width|device-height|inline-size|block-size)\s*:\s*(-?(?:\d+\.?\d*|\.\d+))\s*\)/g

/**
 * Reports a media query whose length feature lost its unit.
 *
 * Keys take the `resolve` path rather than the `var` path — a custom property
 * is invalid inside a media feature — so a numeric token is substituted as bare
 * text. `@media (max-width: 768)` is not a valid feature, and the browser drops
 * the **entire block**, not just one declaration.
 * @param key The resolved key, e.g. `'@media (max-width: 768)'`.
 */
const checkMediaQueryKey = (key: string): void => {
  LENGTH_MEDIA_FEATURES.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LENGTH_MEDIA_FEATURES.exec(key)) !== null) {
    // `0` needs no unit and is perfectly valid.
    if (Number(match[1]) === 0) continue
    report(
      `mq:${key}`,
      `\`${key}\` has a length with no unit, so it is not a valid media feature and the browser drops the whole block. ` +
        `Media queries cannot use CSS variables, so a numeric theme token is substituted as bare text here. ` +
        `Give the token a unit, e.g. '${match[1]}px'.`,
    )
    return
  }
}

/** Depth budget mirroring the resolution walk; `css` objects are shallow. */
const MAX_DEPTH = 16

/**
 * Visits every value in a resolved style object, with the CSS property in scope,
 * and every at-rule key. Plain objects only, matching the resolution walk: class
 * instances (refs, React elements, MUI internals) hold no style declarations. A
 * key that is a selector or at-rule is not a CSS property, so the enclosing
 * property stays in scope rather than `&:hover`.
 * @param value The style object or value to inspect.
 * @param visit Called with each string or number and its property, and with each `@` key and `isKey` set.
 * @param property The CSS property currently in scope, when known.
 * @param depth Current recursion depth.
 */
const walkStyle = (
  value: unknown,
  visit: (leaf: string | number, property: string | undefined, isKey?: boolean) => void,
  property?: string,
  depth = 0,
): void => {
  if (depth > MAX_DEPTH) return
  if (typeof value === 'string' || typeof value === 'number') visit(value, property)
  else if (Array.isArray(value)) for (const item of value) walkStyle(item, visit, property, depth + 1)
  else if (typeof value === 'object' && value !== null) {
    const proto = Object.getPrototypeOf(value)
    if (proto !== null && proto !== Object.prototype) return
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith('@')) visit(key, property, true)
      walkStyle(child, visit, key.startsWith('&') || key.startsWith('@') ? property : key, depth + 1)
    }
  }
}

/**
 * Calls `found` with each theme variable a string references.
 * @param value The string.
 * @param found Called with each variable name.
 */
const forEachVarRef = (value: string, found: (varName: string) => void): void => {
  VAR_REF.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = VAR_REF.exec(value)) !== null) found(match[1])
}

/**
 * Walks a resolved style object and reports every theme token that will not
 * produce a style.
 *
 * Never throws and never mutates. Returns immediately in production, so the
 * cost on a production render is a single boolean check.
 * @param value The style object or value to inspect.
 * @param defined The variables defined where the element renders; `null` when
 * no ThemeProvider is above it; `undefined` when that is not known here, as in a
 * server component, whose token references are then checked by
 * `reportThemeVarRefs` where the providers are.
 */
export const reportThemeIssues = (value: unknown, defined: ThemeVarIndex | null | undefined): void => {
  if (!diagnosticsEnabled()) return
  walkStyle(value, (leaf, property, isKey) => {
    if (isKey) checkMediaQueryKey(leaf as string)
    else if (typeof leaf === 'string' && leaf.includes('--meonode-theme-')) {
      if (defined !== undefined) forEachVarRef(leaf, varName => checkVarReference(varName, property, defined))
    }
    // A literal written straight onto the prop. Needs no theme.
    else if (property) checkLiteralValue(property, leaf)
  })
}

/**
 * A theme variable a server component's css references, and the property it was
 * written against (`''` when none), as `ThemeTokenCheck` receives them.
 */
export type ThemeVarRef = readonly [varName: string, property: string]

/**
 * Every theme variable a resolved style object references, each once per
 * property, in the order written. The same walk as `reportThemeIssues`.
 * @param value The style object or value to inspect.
 * @returns The references.
 */
export const collectThemeVarRefs = (value: unknown): ThemeVarRef[] => {
  const refs: ThemeVarRef[] = []
  walkStyle(value, (leaf, property = '', isKey) => {
    if (!isKey && typeof leaf === 'string')
      forEachVarRef(leaf, varName => {
        if (!refs.some(([name, prop]) => name === varName && prop === property)) refs.push([varName, property])
      })
  })
  return refs
}

/** The variables one extracted rule reads: theme variables, and the property each `--mv-*` variable is read for. */
interface StaticRuleVars {
  refs: ThemeVarRef[]
  valueVars: Map<string, string>
}

/** A declaration block with no block inside it, so its text is only declarations. */
const DECLARATION_BLOCK = /\{([^{}]*)\}/g

const VALUE_VAR_REF = /var\(\s*(--mv-[\w-]+)/g

/** A vendor prefix on a property, as the prefixer writes one. */
const VENDOR_PREFIX = /^-[a-z]+-/

/**
 * A CSS property as a style object spells it, so a static rule's warning names
 * the property as the call site wrote it: `background-color` is `backgroundColor`,
 * `-webkit-user-select` is `WebkitUserSelect`, `-ms-flex` is `msFlex`.
 */
const toStyleKey = (property: string): string =>
  property.startsWith('--') ? property : property.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** Parsed rules, by their text: bounded by the rules the build extracted. */
const staticRuleVars = new Map<string, StaticRuleVars>()

/**
 * The variables an extracted rule reads. A declaration the prefixer copied with
 * a vendor prefix is the same reference as the one it copied, as the call site
 * wrote it once.
 * @param ruleText The rule's css text, as registered.
 * @returns Its theme variable references and its `--mv-*` variables' properties.
 */
const varsOfStaticRule = (ruleText: string): StaticRuleVars => {
  const known = staticRuleVars.get(ruleText)
  if (known !== undefined) return known
  const parsed: StaticRuleVars = { refs: [], valueVars: new Map() }
  for (const [, block] of ruleText.matchAll(DECLARATION_BLOCK)) {
    const declarations: [property: string, value: string][] = []
    for (const declaration of block.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon > 0) declarations.push([declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()])
    }
    for (const [property, value] of declarations) {
      if (!property.startsWith('--') && VENDOR_PREFIX.test(property)) {
        const unprefixed = property.replace(VENDOR_PREFIX, '')
        if (declarations.some(([other, otherValue]) => other === unprefixed && otherValue === value)) continue
      }
      const key = toStyleKey(property)
      forEachVarRef(value, varName => {
        if (!parsed.refs.some(([name, prop]) => name === varName && prop === key)) parsed.refs.push([varName, key])
      })
      for (const [, valueVar] of value.matchAll(VALUE_VAR_REF)) parsed.valueVars.set(valueVar, key)
    }
  }
  staticRuleVars.set(ruleText, parsed)
  return parsed
}

/** The theme variables a node's extracted styles reference, split by where they come from. */
export interface StaticThemeVarRefs {
  /** Those its static rules read: the same for every element with its classes. */
  refs: ThemeVarRef[]
  /** Those a `--mv-*` variable's value holds, by variable: only the element that sets it has them. */
  valueRefs: [valueVar: string, refs: ThemeVarRef[]][]
}

/**
 * Every theme variable a node's extracted styles reference, as
 * `collectThemeVarRefs` gives them for the same styles uncompiled: those its
 * static rules read, and those its `--mv-*` variables' values hold, each under
 * the property the rule reads the variable for.
 * @param classes The node's static classes.
 * @param vars The node's `--mv-*` variables and their values.
 * @param ruleOf The registered text of a static class.
 * @returns The references.
 */
export const collectStaticThemeVarRefs = (
  classes: string | undefined,
  vars: Readonly<Record<string, unknown>> | undefined,
  ruleOf: (className: string) => string | undefined,
): StaticThemeVarRefs => {
  const refs: ThemeVarRef[] = []
  const parsedRules: StaticRuleVars[] = []
  for (const className of classes?.split(' ') ?? []) {
    const ruleText = className ? ruleOf(className) : undefined
    if (!ruleText) continue
    const parsed = varsOfStaticRule(ruleText)
    parsedRules.push(parsed)
    for (const ref of parsed.refs) addThemeVarRef(refs, ref)
  }
  const valueRefs: [string, ThemeVarRef[]][] = []
  for (const [valueVar, value] of Object.entries(vars ?? {})) {
    if (typeof value !== 'string' || !value.includes('--meonode-theme-')) continue
    const property = parsedRules.find(parsed => parsed.valueVars.has(valueVar))?.valueVars.get(valueVar) ?? ''
    const found: ThemeVarRef[] = []
    forEachVarRef(value, varName => addThemeVarRef(found, [varName, property]))
    valueRefs.push([valueVar, found])
  }
  return { refs, valueRefs }
}

/**
 * Adds a theme variable reference unless it is already there.
 * @param refs The references so far.
 * @param ref The one to add.
 */
export const addThemeVarRef = (refs: ThemeVarRef[], ref: ThemeVarRef): void => {
  if (!refs.some(([varName, property]) => varName === ref[0] && property === ref[1])) refs.push(ref)
}

/** Indexes of providers' tokens, by the tokens object: a provider's tokens are usually one object for its lifetime. */
const tokensIndexCache = new WeakMap<object, ThemeVarIndex>()

/**
 * Every variable a provider with these tokens defines, as `getThemeVarIndex`
 * gives it for the provider's theme, which only its tokens decide.
 * @param tokens A ThemeProvider's `tokens`.
 * @returns Its variables.
 */
export const getTokensVarIndex = (tokens: unknown): ThemeVarIndex => {
  if (typeof tokens !== 'object' || tokens === null) return new Map()
  let index = tokensIndexCache.get(tokens)
  if (!index) tokensIndexCache.set(tokens, (index = buildThemeVarIndex({ system: tokens } as Theme)))
  return index
}

/**
 * The variables defined under a nested provider, as `mergeThemeVarIndexes`
 * gives them, without its report: the provider itself reports a redefined token.
 * @param outer What the providers above define, or `null` when there are none.
 * @param own What the nested provider defines.
 * @returns Both.
 */
export const unionThemeVarIndexes = (outer: ThemeVarIndex | null, own: ThemeVarIndex): ThemeVarIndex => {
  if (!outer || outer.size === 0) return own
  if (own.size === 0) return outer
  return new Map([...outer, ...own])
}

/**
 * Reports each referenced variable the providers above do not define, or every
 * one when no provider is above.
 * @param refs The references, from `collectThemeVarRefs`.
 * @param defined The variables defined where the element renders, or `null` when no ThemeProvider is above it.
 */
export const reportThemeVarRefs = (refs: readonly ThemeVarRef[], defined: ThemeVarIndex | null): void => {
  if (!diagnosticsEnabled()) return
  for (const [varName, property] of refs) checkVarReference(varName, property || undefined, defined)
}

/**
 * A `css` key — an at-rule condition or a selector — holds a `theme.` token that
 * nothing could resolve, so its rule was left out: a condition or selector needs
 * the theme's concrete value, and `var()` is invalid there. It happens when no
 * `ThemeProvider` is above the node, or the theme has no value at that path.
 * Reported once per key.
 * @param key The key that was left out.
 */
export const reportUnresolvedThemeKey = (key: string): void => {
  if (!diagnosticsEnabled()) return
  report(
    `unresolved-key:${key}`,
    `The css key \`${key}\` holds a theme token that could not be resolved, so its rule was left out. ` +
      `A condition or selector needs the theme's concrete value: render the node under a ThemeProvider whose tokens define it, ` +
      `or write the value into the key directly.`,
  )
}

/**
 * A theme function (`theme => …`) in a style reached with no theme to call it with,
 * and was dropped. Without this the author sees only a missing style.
 * Reported once per property.
 *
 * The cause, and so the fix, depends on where the element rendered. On the client
 * it is a missing ThemeProvider. In a server component a provider may well be
 * above it, but the provider holds the theme on the client, and a function cannot
 * be handed across to run there; the value has to be a token string, or the
 * element has to move into a client component.
 * @param property The CSS property the function was written against, when known.
 */

/**
 * A `styles` key in a style that holds something other than a string, which is
 * left out of the style (see `holdsReservedStylesKey`). Reported once per
 * object, and once per place and shape: a factory's css is checked before and
 * after it is combined with the call site's, and the first report names the css
 * the object was written in; an inline literal is a new object on every render,
 * with the same place and keys; and two components that make the mistake at the
 * same place with different keys are both reported. One a theme function returns
 * has no place in the css as written, and is reported once per shape.
 * `checkCss` and `checkThemeFunctionResult` call this only while diagnostics are on.
 * @param owner The object holding the `styles` key.
 * @param at Where the object sits in `css`, such as `css["&:hover"]`, or `undefined` when a theme function returned it.
 */
export const reportReservedStylesKey = (owner: Record<string, unknown>, at: string | undefined): void => {
  if (reportedReservedOwners.has(owner)) return
  reportedReservedOwners.add(owner)
  const { styles } = owner
  const shape = `${Object.keys(owner).join(',')}|${typeof styles === 'object' && styles !== null ? Object.keys(styles).join(',') : typeof styles}`
  const seenKey = `reserved-styles:${at ?? ''}:${shape}`
  if (reported.has(seenKey)) return
  reported.add(seenKey)
  const subject = at === undefined ? 'A theme function returned a `styles` key' : `\`${at}\` has a \`styles\` key`
  console.warn(
    `[MeoNode] ${subject} that holds no string. Emotion reserves \`styles\` for serialized styles, ` +
      'such as what `css()` returns, and would write that object from it alone, so the key was left out and the rest of the object applies. ' +
      'Rename the key.',
  )
}

export const reportDroppedThemeFunction = (property?: string): void => {
  if (!diagnosticsEnabled()) return
  const subject = `A theme function ${property ? `for \`${property}\` ` : ''}was dropped`
  report(
    `dropped-function:${property ?? ''}`,
    IS_REACT_SERVER_LAYER
      ? `${subject} because it is in a server component, which cannot run one: the theme is held by ThemeProvider on the client. ` +
          `Write the value as a \`theme.*\` token string, which resolves on the server, or move this element into a client component.`
      : `${subject} because no ThemeProvider is above this node. ` +
          `Theme functions (\`theme => …\`) only run under a provider: render the tree inside ThemeProvider, or write the value directly.`,
  )
}

/**
 * A server-compiled class handed to an element could not be composed with the
 * element's own css: it was compiled in another cache scope — outside a
 * `'use cache'` boundary the element is inside — and is no longer in the store
 * that carries such classes across, was never compiled for a component, or names
 * two different styles there, so its own cannot be told apart. The
 * element keeps it as a separate class, and which rule wins a conflict then
 * depends on stylesheet order. Reported once per class.
 * @param className The class that could not be composed.
 */
export const reportUncomposedClass = (className: string): void => {
  if (!diagnosticsEnabled()) return
  report(
    `uncomposed-class:${className}`,
    `The class \`${className}\` was handed to an element in another cache scope and could not be composed with its own css, ` +
      `so the element carries both classes and which one wins a conflict depends on stylesheet order. ` +
      `The shared store keeps the most recent classes compiled for components; pass the styles as \`css\` instead of a className to compose them in the element's own scope.`,
  )
}

/**
 * Two different styles were given one class name. Each is still written with its
 * own rule. Reported once per name.
 * @param name The name the two styles share.
 */
export const reportSharedStyleName = (name: string): void => {
  if (!diagnosticsEnabled()) return
  report(`shared-style-name:${name}`, `Two different styles were given the class name \`${name}\`. Each was written with its own rule.`)
}

/**
 * What each mounted provider gives each variable it declares, by variable. Kept
 * only while diagnostics are on, for the check between providers that are not
 * nested in one another.
 */
const mountedVars = new Map<string, Map<object, unknown>>()

/**
 * Records a mounted provider's own tokens until the returned cleanup runs, and
 * reports each one another mounted provider gives another value. Providers
 * declare their tokens on `:root`, so two that are not nested share them as a
 * nested pair does: whichever declaration comes later applies to the whole page.
 * Shares the nested check's report key, so a token is reported once whichever
 * check meets it first.
 * @param owner Identifies the provider.
 * @param own What the provider itself defines.
 * @returns Removes the record.
 */
export const trackProviderVars = (owner: object, own: ThemeVarIndex): (() => void) => {
  for (const [varName, value] of own) {
    let owners = mountedVars.get(varName)
    if (!owners) mountedVars.set(varName, (owners = new Map()))
    // `primary: { default: … }` defines `theme.primary` and `theme.primary.default`
    // with one value; the token is reported once, by its shorter name.
    const isDefaultLeaf = varName.endsWith(DEFAULT_SUFFIX) && Object.is(own.get(varName.slice(0, -DEFAULT_SUFFIX.length)), value)
    if (!isDefaultLeaf)
      for (const other of owners.values())
        if (!Object.is(other, value)) {
          report(
            `redefined:${varName}`,
            `Two mounted ThemeProviders give ${toReadablePath(varName)} the values ${JSON.stringify(other)} and ${JSON.stringify(value)}. ` +
              'Tokens are declared on :root, so whichever comes later applies to the whole page. Give one of them a name of its own.',
          )
          break
        }
    owners.set(owner, value)
  }
  return () => {
    for (const varName of own.keys()) {
      const owners = mountedVars.get(varName)
      owners?.delete(owner)
      if (owners?.size === 0) mountedVars.delete(varName)
    }
  }
}

/**
 * Every variable a mounted provider defines, from the record kept while
 * diagnostics are on, or `null` when none is mounted.
 * @returns The variables.
 */
export const mountedThemeVarIndex = (): ThemeVarIndex | null =>
  mountedVars.size === 0 ? null : new Map([...mountedVars.keys()].map(varName => [varName, true]))

/** Test seam: clears the once-per-problem memo and the record of mounted providers. */
export const __resetThemeDiagnostics = (): void => {
  reported.clear()
  reportedReservedOwners = new WeakSet()
  mountedVars.clear()
  staticRuleVars.clear()
  // `NODE_ENV` is captured once at module load, so a test that stubs it needs
  // the captured value re-read. Routed through this seam because the tests that
  // stub the environment already call it immediately afterwards — putting the
  // refresh anywhere else would mean remembering two things instead of one.
  refreshDevMode()
}
