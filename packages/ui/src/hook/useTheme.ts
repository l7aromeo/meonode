'use client'
import { useContext, useEffect } from 'react'
import { ThemeContext } from '@src/components/theme-provider.client.js'

/**
 * Access to the theme context.
 *
 * On the original `theme` path this also writes the document: `data-theme`, the
 * light/dark classes and `localStorage`. That is load-bearing for existing
 * consumers, so it stays exactly as it was.
 *
 * On the mode-aware path it writes nothing. Every consumer runs this hook, so a
 * write here is a write per reader of the theme — which is how a provider
 * sitting on its default came to overwrite a choice a consumer had just made.
 * There, the provider owns the attribute and moves it only when something
 * actually changes.
 * @returns {ThemeContextValue} The theme context value.
 * @throws {Error} If used outside a ThemeProvider.
 */
export const useTheme = () => {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  const { theme, modes } = context
  const ownsDocument = modes === undefined

  useEffect(() => {
    if (!ownsDocument) return

    // Guard non-browser-like runtimes where localStorage can be undefined or non-WebStorage.
    const storage = globalThis.localStorage
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      const currentTheme = storage.getItem('theme')
      if (!currentTheme || currentTheme !== theme.mode) {
        storage.setItem('theme', theme.mode)
      }
    }

    // Apply theme to document root
    const root = document.documentElement

    if (theme.mode === 'dark') {
      root.setAttribute('data-theme', 'dark')
      root.classList.add('dark-theme')
      root.classList.remove('light-theme')
    } else {
      root.setAttribute('data-theme', 'light')
      root.classList.add('light-theme')
      root.classList.remove('dark-theme')
    }
  }, [ownsDocument, theme.mode, theme.system])

  return context
}
