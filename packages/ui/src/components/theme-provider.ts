import { createNode } from '@src/core.node.js'
import _ThemeProvider from '@src/components/theme-provider.client.js'

/**
 * Provides a theme to its children.
 *
 * Takes one token map and the mode names a site declares. The markup it renders
 * does not depend on which mode is in force — the palettes are CSS keyed by
 * `[data-theme="…"]` — so a server can send one document to every reader and a
 * pre-paint script decides what they see before the first frame.
 */
export const ThemeProvider = createNode(_ThemeProvider)

// The prop and context shapes, so an application can name what it passes and
// what `useTheme` hands back without reaching into the client module.
export type { ThemeContextValue, ThemeProviderProps } from '@src/components/theme-provider.client.js'
