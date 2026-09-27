'use client'
import { createElement, type ElementType, type JSX, type ReactElement, type ReactNode, useContext, useMemo } from 'react'
import { __unsafe_useEmotionCache as useEmotionCache, CacheProvider, jsx } from '@emotion/react'
import { serializeStyles } from '@emotion/serialize'
import { compile, middleware, serialize, stringify } from 'stylis'
import type { CssProp, NodeElement } from '@src/types/node.type.js'
import { ThemeContext, type ThemeSnapshot, useThemeSnapshot } from '@src/components/theme-provider.client.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { reportThemeIssues, reportUnresolvedThemeKey } from '@src/util/theme-diagnostics.util.js'
import { isValidElementType } from '@src/helper/react-is.helper.js'
import { prefixer } from '@src/util/emotion-prefixer.util.js'
import { createServerCssCache } from '@src/util/server-css-cache.util.js'

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

export default function StyledRenderer<E extends NodeElement, TProps extends Record<string, any>>({
  element,
  children,
  ...props
}: StyledRendererProps<E> & TProps): JSX.Element {
  const context = useContext(ThemeContext)
  const emotionCache = useEmotionCache()

  // `as` is consumed (never spread onto the DOM). It swaps the render target,
  // mirroring the swap done in `core.node.ts`. This is belt-and-braces: the core
  // path already strips `as` and forwards the resolved element, but if `as` ever
  // reaches here we honor it instead of leaking it as a bogus attribute.
  // `isValidElementType` narrows `asTarget` to `ElementType`, so no cast is needed there.
  const { css, as: asTarget, ...otherProps } = props

  // Tokens and plain values resolve the same whatever the mode, so such an
  // element never re-renders when it changes. A theme function is handed the
  // theme and may read its mode, so an element with one follows the reader's.
  const mode = useThemeSnapshot(context?.store ?? null, ThemeUtil.hasThemeFunction(css) ? selectMode : null, undefined)
  const theme = useMemo(() => (context && mode !== undefined ? { ...context.theme, mode: mode as typeof context.theme.mode } : context?.theme), [context, mode])
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
  reportThemeIssues(finalCss, theme)

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

StyledRenderer.displayName = 'Styled'
;(StyledRenderer as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true

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
  const theme = useContext(ThemeContext)?.theme
  // Resolved as a prop value, so a css string is resolved too, not only a map.
  const resolved = ThemeUtil.resolveObjWithTheme({ css }, theme, { processFunctions: true, themeStringsMode: 'vars' }).css
  const kept = ThemeUtil.dropThemedKeys(resolved, reportUnresolvedThemeKey)
  const serialized = serializeStyles([kept as never])
  const cssText = serialize(compile(`.${className}{${serialized.styles}}`), middleware([prefixer, stringify]))
  if (!cssText) return null
  return createElement('style', { href: `${className}-${serialized.name}`, precedence: 'meonode' }, cssText)
}
