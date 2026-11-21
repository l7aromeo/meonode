// @vitest-environment jsdom
//
// Production inserts extracted rules through the CSSOM, one rule at a time, so a
// module's rule text is split into its rules first; development appends the
// text as it is. A brace or semicolon inside a string, an escape or a comment is
// not a rule boundary, so both must end with the same rules.
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Div, registerStaticCss } from '@src/main.js'
import { __resetStaticCss, __setStaticCssSpeedy, splitRules } from '@src/util/static-css.util.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const QUOTED = 'mn-00000000000qt'
const RULES = `.${QUOTED}{content:"}";}.${QUOTED}::before{content:"{";}`

let roots: Root[] = []

/** Renders a compiled node using `QUOTED` and returns the rules the static sheets ended with. */
function insertedRules(speedy: boolean): string[] {
  __resetStaticCss()
  document.head.innerHTML = ''
  __setStaticCssSpeedy(speedy)
  registerStaticCss('quoted', [[3, QUOTED, RULES]])
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(Div({ __meo$: 2, __meo$s: QUOTED } as never).render() as ReactElement))
  return [...document.head.querySelectorAll<HTMLStyleElement>('style[data-meonode-static]')].flatMap(element =>
    [...(element.sheet?.cssRules ?? [])].map(rule => rule.cssText.replace(/\s+/g, '')),
  )
}

beforeEach(() => __resetStaticCss())
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots = []
  document.body.innerHTML = ''
  __setStaticCssSpeedy()
})

describe('a rule whose text holds a brace that is not a boundary', () => {
  it('reaches the page whole in production, as in development', () => {
    const development = insertedRules(false)
    expect(development).toEqual([`.${QUOTED}{content:"}";}`, `.${QUOTED}::before{content:"{";}`])
    expect(insertedRules(true)).toEqual(development)
  })
})

describe('splitting a rule text into its rules', () => {
  it.each<[string, string, string[]]>([
    ['rules one after another', '.a{color:red}.b{color:blue}', ['.a{color:red}', '.b{color:blue}']],
    [
      'an at-rule holding rules',
      '@media (min-width: 1px){.a{color:red}.b{color:blue}}.c{x:y}',
      ['@media (min-width: 1px){.a{color:red}.b{color:blue}}', '.c{x:y}'],
    ],
    ['a brace in a double-quoted string', '.a{content:"}"}.b{content:"{"}', ['.a{content:"}"}', '.b{content:"{"}']],
    ['a brace in a single-quoted string', ".a{content:'}{'}.b{x:y}", [".a{content:'}{'}", '.b{x:y}']],
    ['an escaped quote inside a string', '.a{content:"\\"}"}.b{x:y}', ['.a{content:"\\"}"}', '.b{x:y}']],
    ['a brace in an unquoted url', '.a{background:url(a}b)}.b{x:y}', ['.a{background:url(a}b)}', '.b{x:y}']],
    ['an escaped brace in a selector', '.a\\}b{x:y}.c{x:y}', ['.a\\}b{x:y}', '.c{x:y}']],
    ['a brace in a comment', '.a{x:y/* } */}.b{x:y}', ['.a{x:y/* } */}', '.b{x:y}']],
    ['a statement ending in a semicolon', '@layer a, b;.a{x:y}', ['@layer a, b;', '.a{x:y}']],
    ['a semicolon inside a rule', '.a{x:y;z:w}', ['.a{x:y;z:w}']],
    ['a brace in a quoted url', '.a{background:url( "a}b" )}.b{x:y}', ['.a{background:url( "a}b" )}', '.b{x:y}']],
    ['a brace in an uppercase url', '.a{background:URL(a}b)}.b{x:y}', ['.a{background:URL(a}b)}', '.b{x:y}']],
    ['an escaped parenthesis in an unquoted url', '.a{background:url(a\\)}b)}.b{x:y}', ['.a{background:url(a\\)}b)}', '.b{x:y}']],
    ['a function whose name ends in url', '.a{x:myurl(}.b{x:y}', ['.a{x:myurl(}', '.b{x:y}']],
    ['a newline ending a bad string', '.a{content:"a\n}.b{x:y}', ['.a{content:"a\n}', '.b{x:y}']],
    ['a comment between rules', '.a{x:y}/* ; } */.b{x:y}', ['.a{x:y}', '/* ; } */.b{x:y}']],
    ['a comment left open', '.a{x:y}/* }', ['.a{x:y}', '/* }']],
    ['a stray closing brace', '}.a{x:y}.b{x:y}', ['}.a{x:y}', '.b{x:y}']],
    ['an escaped opening brace in a selector', '.a\\{b{x:y}.c{x:y}', ['.a\\{b{x:y}', '.c{x:y}']],
    ['a parenthesis in a quoted url', '.a{background:url( "a)}b" )}.b{x:y}', ['.a{background:url( "a)}b" )}', '.b{x:y}']],
    ['a broken trailing rule', '.a{x:y}.b{x:y', ['.a{x:y}', '.b{x:y']],
    ['blank text between rules', '.a{x:y} \n', ['.a{x:y}']],
  ])('%s', (_, text, rules) => {
    expect(splitRules(text)).toEqual(rules)
  })
})
