'use client'
import { createElement, type ElementType, Fragment, type JSX, type ReactElement, type ReactNode, useContext, useInsertionEffect } from 'react'
import { __unsafe_useEmotionCache as useEmotionCache, CacheProvider, jsx, ThemeContext as EmotionThemeContext } from '@emotion/react'
import createCache, { type EmotionCache } from '@emotion/cache'
import { serializeStyles, type SerializedStyles } from '@emotion/serialize'
import { getRegisteredStyles, insertStyles, registerStyles } from '@emotion/utils'
import { NodeUtil } from '@src/util/node.util.js'
import type { CssProp, NodeElement, Theme } from '@src/types/node.type.js'
import { ThemeContext, type ThemeContextState, type ThemeSnapshot, useThemeSnapshot } from '@src/components/theme-provider.client.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { diagnosticsEnabled, reportThemeIssues, reportThemeVarRefs, reportUnresolvedThemeKey, type ThemeVarRef } from '@src/util/theme-diagnostics.util.js'
import { isValidElementType } from '@src/helper/react-is.helper.js'
import { createServerCssCache } from '@src/util/server-css-cache.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'

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
  if (NodeUtil.isServer || emotionCache === null) {
    const { element, children, ...rest } = props
    return renderStyled(element, children, rest, theme, emotionCache, context)
  }
  return renderOwnClass(props as Record<string, any>, theme, emotionCache, emotionTheme, context)
}

/** Inserts one element's rule before layout effects run, where Emotion's own `Insertion` would. */
function RuleInsertion({ cache, serialized, isStringTag }: { cache: EmotionCache; serialized: SerializedStyles; isStringTag: boolean }): null {
  useInsertionEffect(() => {
    insertStyles(cache, serialized, isStringTag)
  })
  return null
}

/** The props a styled element's own element is not given. */
const RENDERER_ONLY = new Set(['element', 'children', 'css', 'as'])

/**
 * Renders the element with the class Emotion's `css` prop would give it, computed
 * here rather than in Emotion's own components. It renders as Emotion's do, beside
 * a leaf for its rule, so what sits below has the place it has on the server; the
 * leaf is there only while the rule is not yet in the sheet.
 */
function renderOwnClass(
  props: Record<string, any>,
  theme: Theme | undefined,
  cache: EmotionCache,
  emotionTheme: unknown,
  context: ThemeContextState | null,
): JSX.Element {
  const asTarget = props.as
  const renderTarget = (asTarget != null && isValidElementType(asTarget) ? asTarget : props.element) as ElementType
  const css = props.css as Record<string, unknown>
  const givenClass = props.className
  let className = ''
  const finalCss: CssProp = ThemeUtil.resolveObjWithTheme(css, theme, { processFunctions: true, themeStringsMode: 'vars' })
  reportStyleTokens(finalCss, context)
  const cssForEmotion = ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(finalCss, reportUnresolvedThemeKey))
  const registered: unknown[] = [cssForEmotion]
  if (typeof givenClass === 'string') className = getRegisteredStyles(cache.registered, registered as string[], givenClass)
  else if (givenClass != null) className = `${givenClass as string} `
  const serialized = serializeStyles(registered as never, undefined, emotionTheme as never)
  const isStringTag = typeof renderTarget === 'string'
  registerStyles(cache, serialized, isStringTag)
  className += `${cache.key}-${serialized.name}`
  const hostProps: Record<string, unknown> = {}
  for (const name in props) if (!RENDERER_ONLY.has(name)) hostProps[name] = props[name]
  hostProps.className = className
  const host = createElement(renderTarget, hostProps, props.children as ReactNode)
  const leaf = cache.inserted[serialized.name] === undefined ? createElement(RuleInsertion, { cache, serialized, isStringTag }) : null
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
  context: ThemeContextState | null,
): JSX.Element {
  // `as` is consumed (never spread onto the DOM). It swaps the render target,
  // mirroring the swap done in `core.node.ts`. This is belt-and-braces: the core
  // path already strips `as` and forwards the resolved element, but if `as` ever
  // reaches here we honor it instead of leaking it as a bogus attribute.
  // `isValidElementType` narrows `asTarget` to `ElementType`, so no cast is needed there.
  const { css, as: asTarget, ...otherProps } = props
  let renderTarget = element as ElementType
  if (asTarget != null && isValidElementType(asTarget)) {
    renderTarget = asTarget
  }

  // `otherProps` arrive already var-converted from `core.node.ts`
  // (`replaceThemeTokensWithCssVars` runs on every node's `elementProps`),
  // so no further processing is needed here. `css` still needs resolution
  // to execute any callable theme refs and to expand string tokens that
  // may have been provided directly via `css` rather than via `elementProps`.
  // Called with no theme too, so a theme function it cannot run is dropped instead
  // of reaching Emotion, which would print its source into the stylesheet.
  const finalCss: CssProp = ThemeUtil.resolveObjWithTheme(css, theme, { processFunctions: true, themeStringsMode: 'vars' })

  // Development only: the last point where the live theme and the fully
  // resolved declarations are both in hand, so a token that names a variable
  // the theme never defines can still be reported before it silently
  // disappears into Emotion. No-ops in production.
  reportStyleTokens(finalCss, context)

  // A key still holding a theme token — no provider above, or a path the theme
  // lacks — names a condition or selector the browser would drop, so it is left
  // out rather than handed to Emotion.
  const cssForEmotion = ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(finalCss, reportUnresolvedThemeKey))

  const styled = jsx(renderTarget, { ...otherProps, css: cssForEmotion }, children)
  // With no cache above it — only on the server, since the browser always has
  // Emotion's default one — Emotion would create a `css` cache here itself, whose
  // memo of compiled rules is shared by all such caches for the life of the
  // process. This one, for the elements below it as Emotion's would be, writes
  // the same rules and classes with that memo bounded.
  if (emotionCache !== null) return styled
  return createElement(CacheProvider, { value: createServerCssCache() }, styled)
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
  const serialized = serializeStyles([kept as never])
  const cssText = compileRule(className, serialized)
  if (!cssText) return null
  return createElement('style', { href: `${className}-${serialized.name}`, precedence: 'meonode' }, cssText)
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
