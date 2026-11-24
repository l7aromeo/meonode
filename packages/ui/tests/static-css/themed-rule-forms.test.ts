// @vitest-environment jsdom
//
// A server component with no theme in scope hands the part of an element's
// style from its first themed condition on to `ThemedRule`, which resolves it
// where the theme is. Uncompiled, that part is the css object; compiled, it is
// the compiler's text, split the same way. Rendered on the server, hydrated,
// then re-themed, both must give the page the same classes, rules and computed
// style. jsdom applies no media condition and resolves no variable, so the
// rules' text carries the conditions and the mode's values.
import { act, createElement, type ReactElement, type ReactNode, useState } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { serializeStyles } from '@emotion/serialize'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemedRule } from '@src/components/styled-renderer.client.js'
import { ThemeProvider, useTheme } from '@src/main.js'
import { NodeUtil } from '@src/util/node.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { splitThemedText } from '@src/util/themed-text.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const COMPACT = '@media (width < theme.bp.compact)'
/** A style whose themed part holds a condition with a token, and a selector after it whose value follows the mode. */
const CSS = { padding: 4, [COMPACT]: { padding: 2 }, '& p': { color: 'theme.ink' } }
const MODES = ['light', 'dark']
const tokensFor = (compact: string) => ({ bp: { compact }, ink: { light: 'rgb(1, 1, 1)', dark: 'rgb(2, 2, 2)' } })

/** The part `ThemedRule` is handed with no theme in scope, as each path splits it. */
function themedParts(): { object: unknown; text: string } {
  const withVars = replaceThemeTokensWithCssVars(CSS)
  const object = ThemeUtil.splitThemedCss(ThemeUtil.resolveDefaultStyle(withVars) as never).themed
  const resolved = ThemeUtil.resolveObjWithTheme(CSS, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(resolved)] as never))
  const text = splitThemedText(styles).themed
  return { object, text }
}

let setMode!: (mode: string) => void
let setCompact!: (compact: string) => void

function Page({ css, className }: { css: unknown; className: string }): ReactNode {
  const [compact, set] = useState('600px')
  setCompact = set
  return ThemeProvider({
    tokens: tokensFor(compact),
    modes: MODES,
    defaultMode: 'light',
    children: [
      createElement(
        function Setter() {
          setMode = useTheme().setMode as never
          return null
        },
        { key: 's' },
      ),
      createElement(
        'div',
        { key: 'host', className, 'data-n': 'host' },
        createElement('p', null, 'x'),
        createElement(ThemedRule, { className, css: css as never }),
      ),
    ],
  } as never).render() as ReactElement
}

let roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/**
 * The page's rules, the host's class, the mode and the host's padding: after
 * hydration, a mode switch, and a token switch. React keeps a document's
 * hoisted styles by their `href` for its life, so each form renders under a
 * class of its own, read back as `X`.
 */
function states(
  css: unknown,
  className: string,
): { hydrationErrors: number; steps: { className: string; rules: string[]; mode: string | null; padding: string }[] } {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  localStorage.clear()
  for (const name of document.documentElement.getAttributeNames()) document.documentElement.removeAttribute(name)
  const container = document.body.appendChild(document.createElement('div'))
  NodeUtil.isServer = true
  try {
    container.innerHTML = renderToString(createElement(Page, { css, className }))
  } finally {
    NodeUtil.isServer = false
  }
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  act(() => void roots.push(hydrateRoot(container, createElement(Page, { css, className }))))
  const read = () => ({
    className: (container.querySelector('[data-n]') as HTMLElement).className.replaceAll(className, 'X'),
    rules: [...document.querySelectorAll<HTMLStyleElement>('style')]
      .filter(element => (element.getAttribute('data-href') ?? element.getAttribute('href'))?.startsWith(className))
      .map(element => (element.textContent ?? '').replaceAll(className, 'X')),
    mode: document.documentElement.getAttribute('data-theme'),
    padding: getComputedStyle(container.querySelector('[data-n]')!).padding,
  })
  const steps = [read()]
  act(() => setMode('dark'))
  steps.push(read())
  act(() => setCompact('900px'))
  steps.push(read())
  const hydrationErrors = error.mock.calls.filter(call => /hydrat/i.test(String(call[0]))).length
  error.mockRestore()
  return { hydrationErrors, steps }
}

describe('ThemedRule handed the themed part as text, as compiled, or as an object, as uncompiled', () => {
  it('splits the two forms at the same block', () => {
    const { object, text } = themedParts()
    expect(Object.keys(object as object)).toEqual([COMPACT, '& p'])
    expect(text.startsWith('@media (width < theme.bp.compact)')).toBe(true)
  })

  it('hydrates, then follows a mode switch and a token switch alike', () => {
    const { object, text } = themedParts()
    const expected = states(object, 'meonode-css-object')
    expect(expected.hydrationErrors).toBe(0)
    const [first, dark, wide] = expected.steps
    expect(first.rules.join('')).toContain('600px')
    expect(wide.rules.join('')).toContain('900px')
    expect([first.mode, dark.mode]).toEqual(['light', 'dark'])
    expect(states(text, 'meonode-css-text')).toEqual(expected)
  })
})
