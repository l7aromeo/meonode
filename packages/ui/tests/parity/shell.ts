// The page every parity case renders in, compiled with the case on each side.
//
// A ThemeProvider with two modes and tokens that name page-level CSS variables,
// so a mode switch changes their values the way a site's own CSS does. A small
// control (shell-control.ts) publishes the provider's `setMode` on
// `window.__parityShell`, which the harness calls to switch modes between
// snapshots.
import { createElement, type ReactElement } from 'react'
import { ThemeProvider } from '@meonode/ui'
import { ModeControl } from './shell-control.js'

/** The tokens every case may use; each names a variable the page's CSS sets per mode. */
export const TOKENS = {
  primary: { default: 'var(--parity-primary)', content: 'var(--parity-on-primary)' },
  surface: 'var(--parity-surface)',
  text: 'var(--parity-text)',
  space: { sm: '4px', md: '8px', lg: '16px' },
  /** Numeric, so a length property reads its px variant. */
  gap: { md: 12 },
  radius: '6px',
  breakpoint: { md: '600px' },
}

/** The page's own CSS: the token values in each mode. Identical on every side. */
export const PAGE_CSS = [
  ':root{--parity-primary:rgb(20, 90, 200);--parity-on-primary:rgb(255, 255, 255);--parity-surface:rgb(245, 245, 245);--parity-text:rgb(17, 17, 17)}',
  '[data-theme="dark"]{--parity-primary:rgb(120, 170, 255);--parity-on-primary:rgb(0, 0, 0);--parity-surface:rgb(24, 24, 24);--parity-text:rgb(230, 230, 230)}',
].join('\n')

/**
 * Wraps a case's element in the page's ThemeProvider.
 * @param children The case's rendered element.
 * @returns The page's element.
 */
export function Shell(children: ReactElement): ReactElement {
  return ThemeProvider({
    modes: ['light', 'dark'],
    defaultMode: 'light',
    tokens: TOKENS,
    children: [createElement(ModeControl, { key: 'mode' }), children],
  } as never).render() as ReactElement
}
