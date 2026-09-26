// @vitest-environment node
//
// The compile that server-compiled rules will travel through.
//
// Additive for now: nothing calls `compileServerEmotionRule` or
// `claimServerRule` until `core.node.ts` switches its server-compile branch to
// them. These pin the properties that switch depends on, each of which a
// prototype of it got wrong once.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNode, Body, Head, Html } from '@src/main.js'
import {
  beginServerEmotionScope,
  claimServerRule,
  compileServerEmotionClassName,
  compileServerEmotionRule,
  endServerEmotionScope,
} from '@src/util/server-emotion.util.js'

const OBJECT = { color: '#112233', padding: 4 }
// What a non-map `css` resolves to before it is compiled.
const ARRAY = [{ color: '#112233' }, { padding: 4 }]

describe('compileServerEmotionRule', () => {
  it.each([
    ['an object', OBJECT],
    ['an array', ARRAY],
  ] as const)('gives %s the class compileServerEmotionClassName gives it', (_, css) => {
    // Server and client output have to keep matching, so switching the caller
    // from one compile to the other must not move a single class name.
    expect(compileServerEmotionRule(css as never)?.className).toBe(compileServerEmotionClassName(css as never))
  })

  it('declines the same values the existing compile declines', () => {
    for (const value of ['color: red', 0, false, undefined]) {
      expect({ value, rule: compileServerEmotionRule(value as never) }).toEqual({ value, rule: undefined })
      expect({ value, className: compileServerEmotionClassName(value as never) }).toEqual({ value, className: undefined })
    }
  })

  it('keeps an array’s declarations together in one rule', () => {
    const rule = compileServerEmotionRule(ARRAY as never)
    expect(rule?.cssText).toContain('color:#112233')
    expect(rule?.cssText).toContain('padding:4px')
  })

  it('answers a repeated class with the same class and rule', () => {
    // What this can and cannot pin: outside the RSC layer `React.cache`
    // memoizes nothing, so each call compiles into a fresh cache and never
    // reaches the repeat path. The repeat that once broke — a compile that
    // returned no class when it could not recover the rule's text, so every
    // element after the first sharing a class lost it — only happens where that
    // cache is shared, and the production-build suite's `/shared-class` is what
    // catches it. Verified: reintroducing it there fails both builds.
    const first = compileServerEmotionRule({ color: '#445566' } as never)
    const second = compileServerEmotionRule({ color: '#445566' } as never)
    expect(second?.className).toBe(first?.className)
    expect(second?.cssText).toBe(first?.cssText)
    expect(second?.cssText).not.toBe('')
  })

  it('asks the caller to emit the rule when no registry scope is open', () => {
    expect(compileServerEmotionRule({ color: '#778899' } as never)?.emit).toBe(true)
  })

  it('leaves the rule to the registry inside its scope, registered where emotion-styled components look', () => {
    // Registration in the scope's cache is what lets MUI's `styled` merge the
    // class into its own, as the client does. Compiled anywhere else, the server
    // emitted two classes where the client had one and hydration failed.
    const scope = beginServerEmotionScope()
    // As `StyleRegistry` does straight after opening it.
    scope.cache.compat = true
    try {
      const rule = compileServerEmotionRule({ color: '#aabbcc' } as never)
      expect(rule?.emit).toBe(false)
      expect(scope.cache.registered[rule!.className]).toBeDefined()
      expect(scope.cache.inserted[rule!.id]).toBe(rule!.cssText)
    } finally {
      endServerEmotionScope(scope)
    }
  })
})

describe('claimServerRule', () => {
  it('claims every time outside the RSC layer, where React dedupes hoisted styles itself', () => {
    // `React.cache` only memoizes per request under the react-server condition.
    // Here it memoizes nothing, which is the documented and safe fallback; the
    // per-request dedupe is asserted in the production-build suite.
    expect(claimServerRule('same-id')).toBe(true)
    expect(claimServerRule('same-id')).toBe(true)
  })
})

describe('a server render with no StyleRegistry', () => {
  function ServerDiv(props: { children?: string; className?: string }) {
    return createElement('div', props)
  }
  const WrappedDiv = createNode(ServerDiv)

  // Not fixed yet: with no registry nothing ever emits a server-compiled rule,
  // so `renderToString` — a Vite SSR app, a test — gets classes and no CSS.
  // Expected to fail until the server-compile branch emits the rule itself.
  it('defines every class a server component compiled', () => {
    const html = renderToString(
      Html({
        children: [
          Head({ key: 'h' }),
          Body({ key: 'b', children: [WrappedDiv({ key: 1, css: OBJECT, children: 'one' }), WrappedDiv({ key: 2, css: OBJECT, children: 'two' })] }),
        ],
      }).render() as never,
    )
    const classes = [...html.matchAll(/<div class="([^"]*)">(one|two)</g)].map(match => match[1])
    expect(classes).toHaveLength(2)
    for (const name of classes) expect(html).toContain(`.${name}{`)
  })
})
