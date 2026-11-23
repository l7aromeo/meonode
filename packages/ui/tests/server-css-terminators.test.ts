// @vitest-environment node
//
// Server CSS that MeoNode joins, or hands React to join, must keep each rule
// whole. Stylis writes a nested `@import` as a statement with no `;`, which
// ends harmlessly where its text ends: in Emotion's own SSR each element's rules
// sit in a `<style>` of their own. Joined to the next rule's text, the statement
// runs on until that rule's block and takes the rule with it, in every browser.
// So a rule MeoNode joins must start where a statement could, after a `}` or a
// `;`, and a rule text React may join (`<style href precedence>`) must end in one.
// A key with an unclosed `(` (`'&:not(.a'`) is worse: stylis keeps it, and its
// group runs to the end of the sheet, past any `}` or `;`. A rule joined after
// it must not be inside that group. And a style that is an `@import` alone
// applies only at the start of a sheet, so it must start one.
//
// Emotion's development build drops a nested `@import` (with a console error),
// and its production build keeps it, so the suite loads the production cache.
import { createElement, Fragment, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { insertStyles } from '@emotion/utils'
import { ServerInsertedHTMLContext } from 'next/navigation.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StyleRegistry from '@src/components/style-registry.client.js'
import { ThemedRule } from '@src/components/styled-renderer.client.js'
import { Div, Span } from '@src/main.js'
import { compileServerEmotionRule } from '@src/util/server-emotion.util.js'
import { leavesOpen, needsSheetStart, sheetStarts, terminateRules } from '@src/util/rule-text.util.js'
import { __resetStaticCss, registerStaticCss } from '@src/util/static-css.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'

// The factory imports what it needs itself: it is hoisted above the file's imports.
vi.mock('@emotion/cache', async () => {
  const { createRequire } = await import('node:module')
  const { dirname, join } = await import('node:path')
  const entry = createRequire(import.meta.url).resolve('@emotion/cache')
  return import(join(dirname(entry), 'emotion-cache.esm.js'))
})

type Css = Record<string, unknown>

/** A style whose stylis output ends in an unterminated `@import` statement. */
const IMPORTING: Css = { padding: 4, '@import url("a.css")': { '&:hover': { color: 'red', marginTop: 1 } } }
/** A style whose stylis output leaves a `(` open: the group runs on to the end of the sheet. */
const UNBALANCED: Css = { padding: 2, '&:not(.a': { color: 'red' } }
/** A style with no declarations of its own: Emotion writes it as the `@import` alone, which applies only at a sheet's start. */
const IMPORT_ONLY = '@import url("b.css");'
/** A node's style that is a nested `@import` alone, its defaults taken away. */
const IMPORT_ALONE: Css = { minHeight: undefined, minWidth: undefined, flexShrink: undefined, '@import url("b.css")': {} }
/** The statement Emotion writes for it. */
const IMPORT_STATEMENT = '@import url("b.css")'
/** The style of the node after it. */
const NEXT: Css = { margin: 2 }

/** The rule text of every `<style>` in `html`. */
const styleTexts = (html: string): string[] => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]!)

/** The closing character of each block a CSS parser opens. */
const CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

/** Whether `at` in `text` is outside every block and string, as CSS tokenizing reads it. */
function atTopLevel(text: string, at: number): boolean {
  const open: string[] = []
  let quote = ''
  for (let i = 0; i < at; i++) {
    const char = text[i]!
    if (quote !== '') {
      if (char === '\\') i++
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char in CLOSERS) open.push(CLOSERS[char]!)
    else if (char === open[open.length - 1]) open.pop()
  }
  return quote === '' && open.length === 0
}

/** Whether the rule for `className` in `text` starts where a CSS parser starts a new rule. */
function startsFresh(text: string, className: string): boolean {
  const at = text.indexOf(`.${className}{`)
  if (at === -1) throw new Error(`no rule for .${className} in ${text}`)
  return atTopLevel(text, at) && (at === 0 || text[at - 1] === '}' || text[at - 1] === ';')
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

/** The `<style>` text holding `fragment`. */
const textHolding = (texts: string[], fragment: string): string => {
  const text = texts.find(t => t.includes(fragment))
  if (text === undefined) throw new Error(`no style holds ${fragment} in ${texts.join(' | ')}`)
  return text
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

describe('leavesOpen', () => {
  // Each closed case is one a count of `(` and `)` would read as open, and each
  // open case one it would read as closed or miss: the scan reads tokens.
  it.each([
    ['no text', ''],
    ['a rule', '.a{padding:4px;}'],
    ['a `(` in a string', '.a::before{content:"(";}'],
    ['a `(` in a single-quoted string with an escaped quote', ".a::before{content:'\\'(';}"],
    ['a `(` in a comment', '.a{padding:1px;/* ( */}'],
    ['a `(` in an unquoted url', '.a{background:url(a(b);}'],
    ['a `(` in an unquoted url in capitals', '.a{background:URL(a(b);}'],
    ['an escaped `(`', '.a\\(b{color:red;}'],
    ['a `(` in a string a newline ends', '.a::before{content:"(\n;}'],
    ['a quoted url', '.a{background:url("a(b");}'],
    ['a `)` in a quoted url', '.a{background:url( "a)b");}'],
    ['a function named like url', '.a{width:myurl(a);}'],
  ])('reads %s as closed', (_, text) => {
    expect(leavesOpen(text)).toBe(false)
  })

  it.each([
    ['an unclosed `(`, as stylis keeps it', '.x{padding:2px;&:not(.a{color:red;}};}'],
    ['an unclosed `(` whose `)` is in a string', '.x{&:not(.a{content:")";}'],
    ['an unclosed `[`', '.x[data-a{color:red;}'],
    ['an unclosed string', '.x::before{content:"a;}'],
    ['an unclosed comment', '.x{padding:1px;}/* a'],
    ['an unclosed unquoted url', '.x{background:url(a.png;}'],
    ['an unclosed unquoted url outside any block', '@import url(a.css'],
    ['an unquoted url whose only `)` is escaped', '.x{background:url(a\\);}'],
    ['an unclosed `{`', '.x{padding:1px;'],
    ['an unclosed string in a function named like url', '.x{width:myurl(a"b);}'],
  ])('reads %s as open', (_, text) => {
    expect(leavesOpen(text)).toBe(true)
  })
})

describe('needsSheetStart', () => {
  it.each([
    ['an @import', '@import url(a.css);', true],
    ['an @import in capitals', '@IMPORT url(a.css);', true],
    ['a rule', '.a{padding:1px;}', false],
    ['a rule, then an @import', '.a{padding:1px;}@import url(a.css);', false],
    ['an @layer statement', '@layer a;', false],
  ])('reads %s', (_, text, starts) => {
    expect(needsSheetStart(text)).toBe(starts)
  })
})

describe('sheetStarts', () => {
  const OPEN = '.x{&:not(.a{color:red;}};}'
  it.each([
    ['rules that join', ['.a{}', '.b{}'], [0]],
    ['a text left open, then a rule', ['.a{}', OPEN, '.b{}'], [0, 2]],
    ['a text left open, last', ['.a{}', OPEN], [0]],
    ['an @import after a rule', ['.a{}', IMPORT_ONLY], [0, 1]],
    ['an @import first', [IMPORT_ONLY, '.a{}'], [0]],
    ['an @import after a text left open, one edge between', [OPEN, IMPORT_ONLY, '.a{}'], [0, 1]],
  ])('splits %s', (_, texts, starts) => {
    expect(sheetStarts(texts)).toEqual(starts)
  })
})

describe("what Emotion's production cache writes for a style", () => {
  /** The text Emotion's production server cache writes for `css`, or `undefined` for none. */
  const written = (css: unknown): string | undefined => insertStyles(createCache({ key: 'css' }), serializeStyles([css] as never), false) as string | undefined

  // Stylis keeps only an unclosed `(` among unbalanced keys; the rest it drops.
  // A stylis that changes either shows here.
  it('keeps a key with an unclosed `(`, leaving the text open', () => {
    const text = written({ padding: 2, '&:not(.a': { color: 'red' } })
    expect(text).toContain('&:not(.a{')
    expect(leavesOpen(text!)).toBe(true)
  })

  it.each([
    ['an unclosed `[`', '&[data-x'],
    ['an unclosed quote', '&[data-x="a'],
    ['an unclosed `@media (`', '@media (min-width: 1px'],
  ])('drops a key with %s, leaving the text closed', (_, key) => {
    const text = written({ padding: 2, [key]: { color: 'red' } })
    expect(text).toMatch(/^\.css-[0-9a-z]+\{padding:2px;\}$/)
    expect(leavesOpen(text!)).toBe(false)
  })

  it('writes a style of only an @import as the statement alone, which must start a sheet', () => {
    expect(written(IMPORT_ONLY)).toBe(IMPORT_ONLY)
    expect(needsSheetStart(IMPORT_ONLY)).toBe(true)
  })

  it.each([['@charset "utf-8";'], ['@namespace svg url(http://www.w3.org/2000/svg);']])('writes nothing for %s', css => {
    expect(written(css)).toBeUndefined()
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

  it('keeps the next named rule out of a group a named rule leaves open, with no registry', () => {
    const first = compile(UNBALANCED).name
    const second = compile(NEXT).name
    const html = renderToString(
      createElement(function Page(): ReactElement {
        return Div({ children: [Div({ ...named(UNBALANCED), children: 'x' }), Div({ ...named(NEXT), children: 'y' })] }).render()
      }),
    )
    const texts = styleTexts(html)
    expect(texts.find(t => t.includes(`.css-${first}{`))).toContain('&:not(.a{')
    expect(
      startsFresh(
        texts.find(t => t.includes(`.css-${second}{`))!,
        `css-${second}`,
      ),
    ).toBe(true)
  })

  it('starts a sheet with a named style that is an @import alone, with no registry', () => {
    const html = renderToString(
      createElement(function Page(): ReactElement {
        return Div({ children: [Div({ ...named(NEXT), children: 'x' }), Div({ ...named(IMPORT_ALONE), children: 'y' })] }).render()
      }),
    )
    expect(compile(IMPORT_ALONE).styles).toBe(`${IMPORT_STATEMENT}{}`)
    expect(textHolding(styleTexts(html), IMPORT_STATEMENT).startsWith(IMPORT_STATEMENT)).toBe(true)
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

/** The `<style>` texts of a StyleRegistry flush of `page`. */
function registryFlush(page: () => ReactElement): string[] {
  const callbacks: (() => unknown)[] = []
  renderToString(
    createElement(
      ServerInsertedHTMLContext.Provider,
      { value: callback => void callbacks.push(callback as never) },
      createElement(StyleRegistry, null, createElement(page)),
    ),
  )
  return styleTexts(renderToString(createElement(Fragment, null, ...(callbacks.map(callback => callback()) as never[]))))
}

describe('server CSS joined by a StyleRegistry flush', () => {
  it('keeps the next rule out of a group a rule leaves open', () => {
    const texts = registryFlush(() => Div({ children: [Div({ css: UNBALANCED, children: 'x' }), Div({ css: NEXT, children: 'y' })] }).render())
    expect(textHolding(texts, '&:not(.a{')).toBeDefined()
    const text = textHolding(texts, 'margin:2px;')
    const second = /\.([a-z-]+-[0-9a-z]+)\{[^}]*margin:2px;\}/.exec(text)![1]!
    expect(startsFresh(text, second)).toBe(true)
  })

  it('starts a sheet with a style that is an @import alone', () => {
    const texts = registryFlush(() => Div({ children: [Div({ css: NEXT, children: 'x' }), Div({ css: IMPORT_ALONE, children: 'y' })] }).render())
    expect(textHolding(texts, IMPORT_STATEMENT).startsWith(IMPORT_STATEMENT)).toBe(true)
  })

  it('keeps one element for rules that join', () => {
    const texts = registryFlush(() => Div({ children: [Div({ css: IMPORTING, children: 'x' }), Div({ css: NEXT, children: 'y' })] }).render())
    expect(texts).toHaveLength(1)
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
