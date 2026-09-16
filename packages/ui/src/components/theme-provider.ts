import { createNode } from '@src/core.node.js'
import _ThemeProvider, { ThemeModesProvider as _ThemeModesProvider } from '@src/components/theme-provider.client.js'

/**
 * A component that provides a theme to its children.
 *
 * Swaps a whole theme object at runtime, which means the document it produces
 * depends on which theme is in force. Prefer {@link ThemeModesProvider} for
 * anything server-rendered and cached.
 */
export const ThemeProvider = createNode(_ThemeProvider)

/**
 * A component that provides one token map and a set of mode names.
 *
 * The document stops depending on the mode: token values are `var()` references,
 * the palettes live in CSS keyed by `[data-theme="…"]`, and the attribute is set
 * before the first paint. One document is then correct for every reader.
 *
 * This is the path to build on. {@link ThemeProvider} keeps the shorter name
 * because taking it would break every existing application, not because it is
 * the better default.
 */
export const ThemeModesProvider = createNode(_ThemeModesProvider)

// The prop and context shapes, so an application can name what it passes and
// what `useTheme` hands back without reaching into the client module.
export type { ThemeContextValue, ThemeModesProviderProps, ThemeProviderProps } from '@src/components/theme-provider.client.js'
