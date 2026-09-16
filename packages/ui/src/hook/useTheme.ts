'use client'
import { useContext, useEffect } from 'react'
import { ThemeContext } from '@src/components/theme-provider.client.js'

/**
 * A hook that provides access to the theme context.
 * It also handles side effects like updating localStorage and applying the theme to the document root.
 * @returns {ThemeContextValue} The theme context value.
 * @throws {Error} If used outside a ThemeProvider.
 */
export const useTheme = () => {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  const { theme } = context

  useEffect(() => {
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

    // Compared as a string, because a site that has declared its own mode names
    // through `MeoTheme` narrows `theme.mode` to those names and `'dark'` is not
    // one of them. This branch is the legacy path's `dark-theme`/`light-theme`
    // classes, which only mean anything for that naming; for any other, the
    // comparison is simply false and the light branch applies, which is the
    // behaviour this path has always had for a mode it did not recognise.
    if ((theme.mode as string) === 'dark') {
      root.setAttribute('data-theme', 'dark')
      root.classList.add('dark-theme')
      root.classList.remove('light-theme')
    } else {
      root.setAttribute('data-theme', 'light')
      root.classList.add('light-theme')
      root.classList.remove('dark-theme')
    }
  }, [theme.mode, theme.system])

  return context
}
