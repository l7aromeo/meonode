import type { Theme } from '@src/types/node.type.js'
import { getValueByPath } from '@src/helper/common.helper.js'

// What a theme gives a token in a condition or a selector. Kept apart from
// `theme.util.ts`, which loads the diagnostics and so `react`: a compiled style's
// registration reaches this module, and must load no more than it needs.

/**
 * The theme's concrete value at a path, for a place CSS needs one — a condition or
 * a selector — or `undefined` when the theme has none there.
 */
export const concreteThemeValue = (themeSystem: Record<string, unknown>, path: string): string | undefined => {
  const themeValue = getValueByPath(themeSystem, path)
  if (themeValue === undefined || themeValue === null) return undefined
  if (typeof themeValue === 'object') return !Array.isArray(themeValue) && 'default' in themeValue ? String(themeValue.default) : undefined
  return String(themeValue)
}

/**
 * The value a token in a condition or a selector takes from `theme`: the one
 * `ThemeUtil.resolveObjWithTheme` writes into a key, or `undefined` when the
 * theme has none there, and the key keeps its token.
 * @param theme The theme in scope.
 * @param path The token's path, after `theme.`.
 */
export const concreteTokenValue = (theme: Theme | undefined, path: string): string | undefined => {
  const system = theme?.system
  return system && typeof system === 'object' ? concreteThemeValue(system as Record<string, unknown>, path) : undefined
}

/**
 * A text that is the same for two themes exactly when the tokens at `paths`
 * take the same values from both in a condition or a selector, which is all a
 * style's keys read from the theme: whether it has a `system` (without one,
 * every key keeps its tokens), then each path's value.
 * @param theme The theme in scope.
 * @param paths The paths of the tokens in the style's keys.
 */
export const concreteTokenSignature = (theme: Theme | undefined, paths: readonly string[]): string => {
  const system = theme?.system
  if (!system || typeof system !== 'object') return ''
  let signature = '+'
  for (const path of paths) {
    const value = concreteThemeValue(system as Record<string, unknown>, path)
    // Length-prefixed, so no two lists of values give one text.
    signature += value === undefined ? '-' : `${value.length}:${value}`
  }
  return signature
}
