'use client'
import { useContext } from 'react'
import { ThemeContext } from '@src/components/theme-provider.client.js'

/**
 * Access to the theme context.
 *
 * It writes nothing. Every consumer runs this hook, so a write here is a write
 * per reader of the theme — which is how a provider sitting on its default came
 * to overwrite a choice a consumer had just made. The provider owns the
 * document's `data-theme` and `data-theme-preference`, asserts them from its own
 * state, and moves them only when that state changes.
 * @returns {ThemeContextValue} The theme context value.
 * @throws {Error} If used outside a ThemeProvider.
 */
export const useTheme = () => {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}
