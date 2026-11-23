// @vitest-environment node
//
// Server CSS that MeoNode joins, or hands React to join, must keep each rule
// whole. Stylis writes a nested `@import` as a statement with no `;`, which
// ends harmlessly where its text ends: in Emotion's own SSR each element's rules
// sit in a `<style>` of their own. Joined to the next rule's text, the statement
// runs on until that rule's block and takes the rule with it, in every browser.
// So a rule MeoNode joins must start where a statement could, after a `}` or a
// `;`, and a rule text React may join (`<style href precedence>`) must end in one.
//
// Emotion's development build drops a nested `@import` (with a console error),
// and its production build keeps it, so the suite loads the production cache.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createElement, Fragment, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { serializeStyles } from '@emotion/serialize'
import { ServerInsertedHTMLContext } from 'next/navigation.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StyleRegistry from '@src/components/style-registry.client.js'
import { ThemedRule } from '@src/components/styled-renderer.client.js'
import { Div, Span } from '@src/main.js'
import { compileServerEmotionRule } from '@src/util/server-emotion.util.js'
import { terminateRules } from '@src/util/rule-text.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'

vi.mock('@emotion/cache', async () => {
  const entry = createRequire(import.meta.url).resolve('@emotion/cache')
  return import(join(dirname(entry), 'emotion-cache.esm.js'))
})

type Css = Record<string, unknown>

/** A style whose stylis output ends in an unterminated `@import` statement. */
const IMPORTING: Css = { padding: 4, '@import url("a.css")': { '&:hover': { color: 'red', marginTop: 1 } } }
/** The style of the node after it. */
const NEXT: Css = { margin: 2 }

/** The rule text of every `<style>` in `html`. */
const styleTexts = (html: string): string[] => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]!)

/** Whether the rule for `className` in `text` starts where a CSS parser starts a new rule. */
function startsFresh(text: string, className: string): boolean {
  const at = text.indexOf(`.${className}{`)
  if (at === -1) throw new Error(`no rule for .${className} in ${text}`)
  return at === 0 || text[at - 1] === '}' || text[at - 1] === ';'
}

/** The name and text the runtime computes for `css`, which the compiler writes for it. */
function compile(css: Css): { name: string; styles: string } {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const serialized = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  return { name: serialized.name, styles: serialized.styles }
}

/** Props giving a node `css` as a compiled node that carries its style's name. */
function named(css: Css): Record<string, unknown> {
  const { name, styles } = compile(css)
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name }
}

afterEach(() => __resetStaticCss())

describe('terminateRules', () => {
  it.each([
    ['no text', '', ''],
    ['a rule', '.a{padding:4px;}', '.a{padding:4px;}'],
    ['a closed statement', '.a{padding:4px;}@import url("a.css");', '.a{padding:4px;}@import url("a.css");'],
    ['an open statement', '.a{padding:4px;}@import url("a.css")', '.a{padding:4px;}@import url("a.css");'],
  ])('ends %s where a statement can end, adding nothing after a block', (_, text, ended) => {
    expect(terminateRules(text)).toBe(ended)
  })
})

describe('server CSS joined by MeoNode', () => {
  it('keeps the next named rule whole after a named rule ending in a statement, with no registry', () => {
    const first = compile(IMPORTING).name
    const second = compile(NEXT).name
    const html = renderToString(
      createElement(function Page(): ReactElement {
        return Div({ children: [Span('before'), Div({ ...named(IMPORTING), children: 'x' }), Div({ ...named(NEXT), children: 'y' })] }).render()
      }),
    )
    const text = styleTexts(html).find(t => t.includes(`.css-${second}{`))!
    expect(text).toContain(`.css-${first}{`)
    expect(text).toContain('@import url("a.css")')
    expect(startsFresh(text, `css-${second}`)).toBe(true)
    // A `;` after a rule's block would open the next rule's selector with it.
    expect(text).not.toContain('};')
  })

  it('keeps the next rule whole in a StyleRegistry flush', () => {
    const callbacks: (() => ReactElement | null)[] = []
    renderToString(
      createElement(
        ServerInsertedHTMLContext.Provider,
        { value: callback => void callbacks.push(callback as never) },
        createElement(
          StyleRegistry,
          null,
          createElement(function Page(): ReactElement {
            return Div({ children: [Div({ css: IMPORTING, children: 'x' }), Div({ css: NEXT, children: 'y' })] }).render()
          }),
        ),
      ),
    )
    const [text] = styleTexts(renderToString(createElement(Fragment, null, ...callbacks.map(callback => callback()))))
    expect(text).toContain('@import url("a.css")')
    const second = /\.([a-z-]+-[0-9a-z]+)\{[^}]*margin:2px;\}/.exec(text!)?.[1]
    expect(second).toBeDefined()
    expect(startsFresh(text!, second!)).toBe(true)
    expect(text).not.toContain('};')
  })
})

describe('server CSS React may join', () => {
  it("ends a server component's rule text where a statement could end", () => {
    const rule = compileServerEmotionRule(ThemeUtil.resolveDefaultStyle(IMPORTING as never))!
    expect(rule.cssText).toContain('@import url("a.css")')
    expect(rule.cssText).toMatch(/[};]$/)
  })

  it("ends a ThemedRule's text where a statement could end", () => {
    const [text] = styleTexts(renderToString(createElement(ThemedRule, { className: 'css-x', css: IMPORTING as never })))
    expect(text).toContain('@import url("a.css")')
    expect(text).toMatch(/[};]$/)
  })
})
