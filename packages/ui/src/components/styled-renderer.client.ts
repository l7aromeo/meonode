'use client'
import { RUNTIME_PRECEDENCE, STATIC_RUN_AFTER_PROP, STATIC_RUN_PROP, STATIC_SCOPE_PROP, STATIC_STYLE_PROP } from '@src/constant/common.const.js'
import { createElement, type ElementType, Fragment, type JSX, type ReactElement, type ReactNode, useContext, useInsertionEffect } from 'react'
import { __unsafe_useEmotionCache as useEmotionCache, CacheProvider, jsx, ThemeContext as EmotionThemeContext } from '@emotion/react'
import createCache, { type EmotionCache } from '@emotion/cache'
import { serializeStyles, type SerializedStyles } from '@emotion/serialize'
import { getRegisteredStyles, insertStyles, registerStyles } from '@emotion/utils'
import { NodeUtil } from '@src/util/node.util.js'
import type { CssProp, NodeElement, Theme } from '@src/types/node.type.js'
import { ThemeContext, type ThemeContextState, type ThemeSnapshot, useThemeSnapshot } from '@src/components/theme-provider.client.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import {
  collectNamedThemeVarRefs,
  diagnosticsEnabled,
  reportThemeIssues,
  reportThemeVarRefs,
  reportUnresolvedThemeKey,
  type ThemeVarRef,
} from '@src/util/theme-diagnostics.util.js'
import { isValidElementType } from '@src/helper/react-is.helper.js'
import { createServerCssCache } from '@src/util/server-css-cache.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { type NamedStyle, serverStyleElement, standInServerCache } from '@src/util/named-style.util.js'
import { textForTheme } from '@src/util/themed-text.util.js'

export interface StyledRendererProps<E extends NodeElement> {
  element: E
  children: ReactNode
  css: CssProp
}

/**
 * A client-side component that renders a styled element using Emotion.
 * It resolves theme values and applies default styles.
 * @template E The type of the HTML element to render.
 * @template TProps The type of the props for the component.
 * @param element The HTML element to render (e.g., 'div', 'span').
 * @param children Optional children to be rendered inside the element.
 * @param props
 * @returns {JSX.Element} The rendered JSX element.
 */
const selectMode = (snapshot: ThemeSnapshot) => snapshot.mode

export default function StyledRenderer<E extends NodeElement, TProps extends Record<string, any>>(props: StyledRendererProps<E> & TProps): JSX.Element {
  const context = useContext(ThemeContext)
  const emotionCache = useEmotionCache()

  // Tokens and plain values resolve the same whatever the mode, so such an
  // element reads no mode and never re-renders when it changes. A theme function
  // is handed the theme and may read its mode, so an element with one follows the
  // reader's. The same hooks run either way, so an element whose css gains or
  // loses a function keeps its identity and everything below it.
  const readsTheme = ThemeUtil.hasThemeFunction(props.css)
  const mode = useThemeSnapshot(context?.store ?? null, readsTheme ? selectMode : null)
  const emotionTheme = useContext(EmotionThemeContext)
  const theme = context && mode !== undefined ? { ...context.theme, mode: mode as typeof context.theme.mode } : context?.theme
  // The named styles of its render that began since the previous rule, which go
  // in ahead of its own. With them, the server renders the element as the
  // browser does, beside MeoNode's own leaf, which renders them with its rule.
  const run = (props as Record<string, unknown>)[STATIC_RUN_PROP] as readonly NamedStyle[] | undefined
  // And the ones that began after it, which no later rule of its render takes.
  const given = (props as Record<string, unknown>)[STATIC_RUN_AFTER_PROP] as { run: readonly NamedStyle[] } | undefined
  const after = given !== undefined && given.run.length > 0 ? given.run : undefined
  // The cache of its scope on a server render with no provider, which it gives
  // the elements below it, as Emotion gives its own to the ones below it.
  const scope = (props as Record<string, unknown>)[STATIC_SCOPE_PROP] as EmotionCache | undefined
  if (NodeUtil.isServer && emotionCache === null && scope !== undefined) {
    const { element, children, ...rest } = props
    const own =
      run || after
        ? renderOwnClass(props as Record<string, any>, theme, scope, emotionTheme, context, run, after)
        : renderStyled(element, children, rest, theme, scope, emotionTheme, context)
    return createElement(CacheProvider, { value: scope }, own)
  }
  if (NodeUtil.isServer || emotionCache === null) {
    if (run || after) return renderOwnClass(props as Record<string, any>, theme, emotionCache ?? standInServerCache(), emotionTheme, context, run, after)
    const { element, children, ...rest } = props
    return renderStyled(element, children, rest, theme, emotionCache, emotionTheme, context)
  }
  return renderOwnClass(props as Record<string, any>, theme, emotionCache, emotionTheme, context, run, after)
}

/**
 * Inserts one element's rule before layout effects run, where Emotion's own
 * `Insertion` would, after the named styles of its render that began since the
 * previous rule. On the server it renders them in place, as `Insertion` does.
 */
function RuleInsertion({
  cache,
  serialized,
  isStringTag,
  run,
  after,
}: {
  cache: EmotionCache
  serialized: SerializedStyles
  isStringTag: boolean
  run?: readonly NamedStyle[]
  after?: readonly NamedStyle[]
}): ReactElement | null {
  // The same on every render of this leaf: a server render never renders again in the browser.
  if (NodeUtil.isServer) return serverStyleElement(cache, [...(run ?? []), { serialized, isStringTag }, ...(after ?? [])])
  useInsertionEffect(() => {
    if (run) for (const style of run) insertStyles(cache, style.serialized, style.isStringTag)
    insertStyles(cache, serialized, isStringTag)
    if (after) for (const style of after) insertStyles(cache, style.serialized, style.isStringTag)
  })
  return null
}

/** The props a styled element's own element is not given. */
const RENDERER_ONLY = new Set(['element', 'children', 'css', 'as', STATIC_RUN_PROP, STATIC_RUN_AFTER_PROP, STATIC_SCOPE_PROP, STATIC_STYLE_PROP])

/** A compiled node's style, as the compiler serialized it. */
interface CompiledStyle {
  name: string
  styles: string
}

/**
 * An element's css as it goes to Emotion: theme references resolved, then the
 * defaults added.
 * @param css The element's css.
 * @param theme The theme in scope.
 * @param context The theme context, for development reports.
 * @returns The css for Emotion.
 */
function cssOf(css: unknown, theme: Theme | undefined, context: ThemeContextState | null): unknown {
  // Called with no theme too, so a theme function it cannot run is dropped instead
  // of reaching Emotion, which would print its source into the stylesheet.
  const finalCss: CssProp = ThemeUtil.resolveObjWithTheme(css as Record<string, unknown>, theme, { processFunctions: true, themeStringsMode: 'vars' })
  // Development only: the last point where the live theme and the fully
  // resolved declarations are both in hand, so a token that names a variable
  // the theme never defines can still be reported before it silently
  // disappears into Emotion. No-ops in production.
  reportStyleTokens(finalCss, context)
  // A key still holding a theme token — no provider above, or a path the theme
  // lacks — names a condition or selector the browser would drop, so it is left
  // out rather than handed to Emotion.
  return ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(finalCss, reportUnresolvedThemeKey))
}

/**
 * A compiled style's text as it goes to Emotion, its theme variables reported
 * against the theme in scope in development, as {@link cssOf} reports css's.
 * @param compiled The compiled style.
 * @param context The theme context.
 * @returns The text.
 */
function textOf(compiled: CompiledStyle, context: ThemeContextState | null): string {
  if (diagnosticsEnabled()) reportThemeVarRefs(collectNamedThemeVarRefs(compiled.styles), context ? context.definedVars() : null)
  return compiled.styles
}

/**
 * A compiled style for the theme the element renders under: as the compiler
 * serialized it, or, where a condition or selector in it holds a theme token,
 * resolved for that theme (see {@link textForTheme}), each block left out
 * reported in development as {@link cssOf} reports a key it leaves out.
 * @param compiled The compiled style, if any.
 * @param theme The theme in scope.
 * @returns The style to render.
 */
function compiledFor(compiled: CompiledStyle | undefined, theme: Theme | undefined): CompiledStyle | undefined {
  if (compiled === undefined) return undefined
  const themed = textForTheme(compiled.styles, theme)
  if (themed === undefined) return compiled
  if (diagnosticsEnabled()) for (const prelude of themed.dropped) reportUnresolvedThemeKey(prelude)
  return themed
}

/**
 * The serialized styles for an element's css and the registered styles folded
 * into it. A compiled style with nothing folded in keeps the compiler's name.
 * @param registered The element's css, then the styles folded in.
 * @param compiled The compiled style the css stands for, if any.
 * @param emotionTheme Emotion's theme, for its function interpolations.
 * @returns The serialized styles.
 */
function serializedOf(registered: unknown[], compiled: CompiledStyle | undefined, emotionTheme: unknown): SerializedStyles {
  if (compiled && registered.length === 1) return { name: compiled.name, styles: compiled.styles, next: undefined }
  return nameStyles(serializeStyles(registered as never, undefined, emotionTheme as never))
}

/**
 * Renders the element with the class Emotion's `css` prop would give it under
 * MeoNode's name for its styles ({@link nameStyles}), computed here rather than
 * in Emotion's own components. It renders as Emotion's do, beside a leaf for its
 * rule, so what sits below has the place it has on the server; the leaf is there
 * only while the rule, or a named style of `run`, is not yet in the sheet. On the
 * server it renders an element this way only when the element carries a run.
 */
function renderOwnClass(
  props: Record<string, any>,
  theme: Theme | undefined,
  cache: EmotionCache,
  emotionTheme: unknown,
  context: ThemeContextState | null,
  run?: readonly NamedStyle[],
  after?: readonly NamedStyle[],
): JSX.Element {
  const asTarget = props.as
  const renderTarget = (asTarget != null && isValidElementType(asTarget) ? asTarget : props.element) as ElementType
  const givenClass = props.className
  let className = ''
  const compiled = compiledFor(props[STATIC_STYLE_PROP] as CompiledStyle | undefined, theme)
  const registered: unknown[] = [compiled ? textOf(compiled, context) : cssOf(props.css, theme, context)]
  if (typeof givenClass === 'string') className = getRegisteredStyles(cache.registered, registered as string[], givenClass)
  else if (givenClass != null) className = `${givenClass as string} `
  const serialized = serializedOf(registered, compiled, emotionTheme)
  const isStringTag = typeof renderTarget === 'string'
  registerStyles(cache, serialized, isStringTag)
  className += `${cache.key}-${serialized.name}`
  const hostProps: Record<string, unknown> = {}
  for (const name in props) if (!RENDERER_ONLY.has(name)) hostProps[name] = props[name]
  hostProps.className = className
  const host = createElement(renderTarget, hostProps, props.children as ReactNode)
  // Each named style goes into its own scope's cache where it has one: on a server
  // render with no provider, a style after this element's scope may be under another.
  const notIn = (styles: readonly NamedStyle[] | undefined) =>
    styles !== undefined && styles.some(style => (style.scope ?? cache).inserted[style.serialized.name] === undefined)
  const pending = cache.inserted[serialized.name] === undefined || notIn(run) || notIn(after)
  const leaf = pending ? createElement(RuleInsertion, { cache, serialized, isStringTag, ...(run && { run }), ...(after && { after }) }) : null
  return createElement(Fragment, null, leaf, host)
}

/**
 * Reports the theme tokens in resolved css that will not produce a style, against
 * the providers above `context`. Development only.
 *
 * With no provider above, a token is left as `theme.…` text rather than turned
 * into the variable the server emits for it, so it is turned into one here, for
 * the check alone, and reported as having no provider.
 * @param css The resolved css.
 * @param context The nearest provider's context, or `null`.
 */
function reportStyleTokens(css: unknown, context: ThemeContextState | null): void {
  if (!diagnosticsEnabled()) return
  if (context) reportThemeIssues(css, context.definedVars())
  else reportThemeIssues(replaceThemeTokensWithCssVars(css), null)
}

StyledRenderer.displayName = 'Styled'

/** Resolves an element's css against the theme and renders it with Emotion. */
function renderStyled(
  element: NodeElement,
  children: ReactNode,
  props: Record<string, any>,
  theme: Theme | undefined,
  emotionCache: EmotionCache | null,
  emotionTheme: unknown,
  context: ThemeContextState | null,
): JSX.Element {
  // `as` is consumed (never spread onto the DOM). It swaps the render target,
  // mirroring the swap done in `core.node.ts`. This is belt-and-braces: the core
  // path already strips `as` and forwards the resolved element, but if `as` ever
  // reaches here we honor it instead of leaking it as a bogus attribute.
  // `isValidElementType` narrows `asTarget` to `ElementType`, so no cast is needed there.
  const {
    css,
    as: asTarget,
    className: givenClass,
    [STATIC_STYLE_PROP]: given,
    [STATIC_RUN_AFTER_PROP]: _after,
    [STATIC_SCOPE_PROP]: _scope,
    ...otherProps
  } = props as typeof props & { [STATIC_STYLE_PROP]?: CompiledStyle; [STATIC_RUN_AFTER_PROP]?: unknown; [STATIC_SCOPE_PROP]?: unknown }
  let renderTarget = element as ElementType
  if (asTarget != null && isValidElementType(asTarget)) {
    renderTarget = asTarget
  }

  // `otherProps` arrive already var-converted from `core.node.ts`
  // (`replaceThemeTokensWithCssVars` runs on every node's `elementProps`),
  // so no further processing is needed here. `css` still needs resolution
  // to execute any callable theme refs and to expand string tokens that
  // may have been provided directly via `css` rather than via `elementProps`.
  // A compiled style comes serialized already.
  const compiled = compiledFor(given, theme)
  const cssForEmotion = compiled ? textOf(compiled, context) : cssOf(css, theme, context)

  // With no cache above it — only on the server, since the browser always has
  // Emotion's default one — Emotion would create a `css` cache here itself, whose
  // memo of compiled rules is shared by all such caches for the life of the
  // process. This one, for the elements below it as Emotion's would be, writes
  // the same rules with that memo bounded.
  const cache = emotionCache ?? createServerCssCache()

  // Composed here, as `renderOwnClass` composes in the browser, so the styles get
  // MeoNode's name: the handed classes this cache registered are folded into the
  // styles, and the rest kept. Emotion's `css` prop then takes the one serialized
  // value as it is, name included, and renders its rule as it always does.
  const registered: unknown[] = [cssForEmotion]
  let className: string | undefined
  if (typeof givenClass === 'string') className = getRegisteredStyles(cache.registered, registered as string[], givenClass).trim() || undefined
  else if (givenClass != null) className = String(givenClass)
  const serialized = serializedOf(registered, compiled, emotionTheme)

  const styled = jsx(renderTarget, { ...otherProps, className, css: serialized }, children)
  if (emotionCache !== null) return styled
  return createElement(CacheProvider, { value: cache }, styled)
}

;(StyledRenderer as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true

/**
 * The key of the cache `ThemedRule` compiles with in the browser. No server
 * style carries it, so creating the cache adopts none of the page's style
 * elements.
 */
const THEMED_RULE_CACHE_KEY = 'meonode-themed-rule'

/** The cache `ThemedRule` compiles with in the browser, created on first use. */
let browserRuleCache: EmotionCache | undefined

/**
 * Compiles `serialized` for the class `className` through an Emotion cache's own
 * pipeline, so the text is what Emotion writes for it: its stylis, its labels
 * and selector fixes, its vendor prefixes. Nothing is inserted or marked
 * inserted.
 *
 * On the server the cache is one of {@link createServerCssCache}'s, whose memo of
 * compiled rules is bounded; the name it memoizes under includes the class, so a
 * rule compiled for another class is never reused. In the browser Emotion keeps
 * no such memo, and one cache serves every rule.
 *
 * Emotion's development build also writes an empty rule for each parent selector
 * in the browser, and not on the server, so there the two texts differ. That
 * never reaches hydration: React adopts the style element the server sent by its
 * href, without comparing its text.
 * @returns The rule text.
 */
function compileRule(className: string, serialized: SerializedStyles): string {
  const cache = NodeUtil.isServer ? createServerCssCache() : (browserRuleCache ??= createCache({ key: THEMED_RULE_CACHE_KEY }))
  const written: string[] = []
  const sheet = { insert: (rule: string) => void written.push(rule) }
  // The server build returns the rules; the browser build writes them to the sheet.
  const rules = cache.insert(`.${className}`, { ...serialized, name: `${className}-${serialized.name}` }, sheet as never, false)
  return typeof rules === 'string' ? rules : written.join('')
}

export interface ThemedRuleProps {
  /** The class the server compiled for the element, which this rule targets. */
  className: string
  /** The part of the element's css whose keys hold theme tokens, and every nested entry after it. */
  css: CssProp
}

/**
 * The rule for the part of a server component's `css` whose keys — at-rule
 * conditions, selectors — hold theme tokens.
 *
 * A key needs the theme's concrete value, since `var()` is invalid in a condition
 * or a selector, and a server component cannot read the `ThemeProvider` above it.
 * This runs where the theme is: the server pass of the client tree and the
 * browser. It resolves the keys, and renders the rule for the class the server
 * already gave the element, as a hoisted `<style href precedence>` placed after
 * the server's own rule for that class, so it cascades as the one rule Emotion
 * would have written. A key still holding a token — there is no theme, or the
 * theme has no such value — is left out and reported in development.
 * @returns The rule, or `null` when nothing is left to style.
 */
export function ThemedRule({ className, css }: ThemedRuleProps): ReactElement | null {
  const context = useContext(ThemeContext)
  const theme = context?.theme
  // Resolved as a prop value, so a css string is resolved too, not only a map.
  const resolved = ThemeUtil.resolveObjWithTheme({ css }, theme, { processFunctions: true, themeStringsMode: 'vars' }).css
  const kept = ThemeUtil.dropThemedKeys(resolved, reportUnresolvedThemeKey)
  // The declarations under its keys, as `StyledRenderer` checks a whole element's.
  reportStyleTokens(kept, context)
  const serialized = nameStyles(serializeStyles([kept as never]))
  const cssText = compileRule(className, serialized)
  if (!cssText) return null
  return createElement('style', { href: `${className}-${serialized.name}`, precedence: RUNTIME_PRECEDENCE }, cssText)
}

export interface ThemeTokenCheckProps {
  /** The theme variables the element's server-compiled css references. */
  refs: readonly ThemeVarRef[]
}

/**
 * The development check for the theme tokens of an element a server component
 * styled.
 *
 * A server component compiles its css without the ThemeProvider above it, which
 * holds the theme on the client, so it cannot tell whether a token's variable is
 * defined. It hands the references here instead, rendered where the element is:
 * on the server pass of the client tree and in the browser this reads the
 * providers above and reports what `StyledRenderer` would for the same css. Only
 * rendered while diagnostics are on.
 * @returns Nothing.
 */
export function ThemeTokenCheck({ refs }: ThemeTokenCheckProps): null {
  const context = useContext(ThemeContext)
  if (diagnosticsEnabled()) reportThemeVarRefs(refs, context ? context.definedVars() : null)
  return null
}
