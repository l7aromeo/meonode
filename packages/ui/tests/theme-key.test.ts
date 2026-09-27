import { describe, expect, it } from 'vitest'
import { keyHasThemeToken, removeBlocksWithThemeTokens, replaceKeyTokens, textHasThemeTokenInPrelude } from '@src/util/theme-key.util.js'

describe('keyHasThemeToken', () => {
  it.each([
    ['@media (width >= theme.breakpoint.wide)', true],
    ['&[data-size="theme.size.lg"]', true],
    ['theme.selector.card &', true],
    ['& .theme.accent', false],
    ['&.theme.accent', false],
    ['& .my-theme.accent', false],
    ['& #theme.accent', false],
    ['@media (min-width: 600px)', false],
  ])('%s: %s', (key, expected) => {
    expect(keyHasThemeToken(key)).toBe(expected)
  })
})

describe('textHasThemeTokenInPrelude', () => {
  it.each([
    ['@media (min-width: theme.breakpoint.wide) { color: red; }', true],
    ['color: theme.primary; & .theme.accent { color: red; }', false],
    ['color: theme.primary;', false],
    ['& [data-size="theme.size.lg"] { color: red; }', true],
  ])('%s: %s', (text, expected) => {
    expect(textHasThemeTokenInPrelude(text)).toBe(expected)
  })
})

describe('replaceKeyTokens', () => {
  const resolve = (path: string) => ({ 'breakpoint.wide': '1000px' })[path]

  it('replaces a token it can resolve and keeps one it cannot', () => {
    expect(replaceKeyTokens('@media (theme.breakpoint.wide <= width <= theme.breakpoint.huge)', resolve)).toBe(
      '@media (1000px <= width <= theme.breakpoint.huge)',
    )
  })

  it('in CSS text, touches only preludes', () => {
    const text = 'color: theme.breakpoint.wide; @media (width >= theme.breakpoint.wide) { width: theme.breakpoint.wide; }'
    expect(replaceKeyTokens(text, resolve, true)).toBe('color: theme.breakpoint.wide; @media (width >= 1000px) { width: theme.breakpoint.wide; }')
  })
})

describe('removeBlocksWithThemeTokens', () => {
  it('removes each block whose prelude holds a token, nested blocks included, and reports it', () => {
    const reported: string[] = []
    const text = 'color: red; @media (width >= theme.a) { &:hover { color: blue; } } & .theme.accent { color: green; } &[x="theme.b"] { color: teal; }'

    expect(removeBlocksWithThemeTokens(text, prelude => reported.push(prelude))).toBe('color: red; & .theme.accent { color: green; }')
    expect(reported).toEqual(['@media (width >= theme.a)', '&[x="theme.b"]'])
  })
})
