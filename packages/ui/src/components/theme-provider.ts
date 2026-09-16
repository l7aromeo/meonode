import { createNode } from '@src/core.node.js'
import _ThemeProvider from '@src/components/theme-provider.client.js'

/**
 * A component that provides a theme to its children.
 */
export const ThemeProvider = createNode(_ThemeProvider)

// The prop and context shapes, so an application can name what it passes and
// what `useTheme` hands back without reaching into the client module.
export type { ThemeContextValue, ThemeModesProviderProps, ThemeProviderProps } from '@src/components/theme-provider.client.js'
