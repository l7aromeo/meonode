// @vitest-environment jsdom
//
// The development check of a named style's theme variables, run after commit on
// elements under a component, when the element is server markup React has not
// hydrated yet. Such an element has no fiber to read the providers above it
// from, and its providers have not recorded their tokens, so checking it then
// would report every variable as undefined. It is checked once React hydrates
// it, against the providers above it, or against the mounted providers when it
// is still not hydrated after the check's last look.
import { serializeStyles } from '@emotion/serialize'
import { act, createElement, type ReactElement } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, Node, ThemeProvider } from '@src/main.js'
import { checkCandidatesAfterCommit, __resetCheckedCandidates } from '@src/util/static-theme-check.util.js'
import { ThemeContext } from '@src/components/theme-provider.client.js'
import { NodeUtil } from '@src/util/node.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { __checkedThemeVars, __resetThemeDiagnostics, type ThemeVarRef } from '@src/util/theme-diagnostics.util.js'
import { asThemeProps } from '../_theme-props.js'
import { checksSettled } from './_checks-settled.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const theme = { mode: 'light', system: { primary: { default: 'rgb(0, 0, 255)' } } } as const

type Css = Record<string, unknown>

/** Props for a node of `css` as the compiler emits it: its tokens as variables, its style named and registered. */
function named(css: Css): Record<string, unknown> {
  const resolved = ThemeUtil.resolveObjWithTheme(replaceThemeTokensWithCssVars(css), undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name }
}

/** A component that renders its children as given, so the node below it is checked after commit. */
const Wrapper = ({ children }: { children?: unknown }) => children as ReactElement

/** The page: a provider, then a component, then a named node of `css` after a runtime sibling, so it renders plain. */
const page = (css: Css) =>
  createElement(function Page() {
    return ThemeProvider({
      ...asThemeProps(theme as never),
      children: Div({
        children: Node(Wrapper, {
          children: Div({ children: [Div({ key: 'rule', css: { order: 0 } }), Div({ key: 'named', id: 'named', ...named(css) } as never)] }),
        }),
      }),
    }).render() as ReactElement
  })

let warnings: string[] = []
let originalWarn: typeof console.warn
let roots: Root[] = []

beforeEach(() => {
  __resetStaticCss()
  __resetThemeDiagnostics()
  __resetCheckedCandidates()
  warnings = []
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => void warnings.push(String(args[0]))
})
afterEach(() => {
  vi.useRealTimers()
  console.warn = originalWarn
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
})

/** Puts the server's markup of the page in the document, not hydrated. */
function serverMarkup(css: Css): HTMLElement {
  NodeUtil.isServer = true
  let html: string
  try {
    html = renderToString(page(css))
  } finally {
    NodeUtil.isServer = false
  }
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)
  return container
}

const hydrate = (container: HTMLElement, css: Css) => act(() => void roots.push(hydrateRoot(container, page(css))))

const tokenWarnings = () => warnings.filter(text => text.includes('--meonode-theme-'))

/** The candidate a client walk gives the named node: its classes and the variables its style reads. */
const candidate = (refs: ThemeVarRef[]) => ({ classes: document.getElementById('named')!.className, refs })

/** Lets the check's first look run: on the next task, then its microtasks. */
const firstLook = () => new Promise(resolve => setTimeout(resolve, 0))

describe('a named node in server markup checked before React hydrates it', () => {
  it('is not reported for a variable its provider defines', async () => {
    const container = serverMarkup({ color: 'theme.primary' })
    // The server render warns for nothing: the provider is above the node.
    expect(tokenWarnings()).toEqual([])
    __resetThemeDiagnostics()
    checkCandidatesAfterCommit([candidate([['--meonode-theme-primary', 'color']])], ThemeContext)
    await firstLook()
    hydrate(container, { color: 'theme.primary' })
    await checksSettled()
    expect(tokenWarnings()).toEqual([])
    // No warning from a check that never ran: the variable was checked.
    expect([...__checkedThemeVars()]).toContain('--meonode-theme-primary')
  })

  it('is reported once React hydrates it, for a variable no provider above defines', async () => {
    const container = serverMarkup({ color: 'theme.primary.missing' })
    warnings = []
    __resetThemeDiagnostics()
    checkCandidatesAfterCommit([candidate([['--meonode-theme-primary-missing', 'color']])], ThemeContext)
    await firstLook()
    expect(tokenWarnings()).toEqual([])
    hydrate(container, { color: 'theme.primary.missing' })
    await checksSettled()
    const reported = tokenWarnings()
    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('is not defined by the active theme')
  })
})

describe('a candidate none of whose elements is in the document', () => {
  // A render React discards never commits, so its candidates are looked for for
  // about ten frames only, not for as long as server markup waits to hydrate.
  it('is no longer looked for after about ten frames', async () => {
    vi.useFakeTimers()
    serverMarkup({ color: 'theme.primary.missing' })
    const late = candidate([['--meonode-theme-primary-missing', 'color']])
    const container = document.body.firstElementChild!
    container.remove()
    warnings = []
    checkCandidatesAfterCommit([late], ThemeContext)
    await vi.advanceTimersByTimeAsync(500)
    document.body.append(container)
    await vi.advanceTimersByTimeAsync(3000)
    expect(tokenWarnings()).toEqual([])
  })
})

describe('a named node in markup React never hydrates', () => {
  it('is checked against the mounted providers after the last look', async () => {
    vi.useFakeTimers()
    serverMarkup({ color: 'theme.primary' })
    checkCandidatesAfterCommit([candidate([['--meonode-theme-primary', 'color']])], ThemeContext)
    await vi.advanceTimersByTimeAsync(1000)
    expect(tokenWarnings()).toEqual([])
    await vi.advanceTimersByTimeAsync(2000)
    // No provider is mounted, so the variable is reported as with no provider above.
    expect(tokenWarnings()).toHaveLength(1)
  })
})
