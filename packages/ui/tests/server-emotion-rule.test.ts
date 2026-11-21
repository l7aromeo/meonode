// @vitest-environment node
//
// The compile a server component's css goes through in the React Server
// Components layer, and what reaches a server render with no registry.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { describe, expect, it } from 'vitest'
import { createNode, Body, Head, Html } from '@src/main.js'
import { compileServerEmotionRule } from '@src/util/server-emotion.util.js'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { ThemeUtil } from '@src/util/theme.util.js'

const OBJECT = { color: '#112233', padding: 4 }
// What a non-map `css` resolves to before it is compiled.
const ARRAY = [{ color: '#112233' }, { padding: 4 }]

describe('compileServerEmotionRule', () => {
  it.each([
    ['an object', OBJECT],
    ['an array', ARRAY],
  ] as const)('gives %s the class a client component gets for it under StyleRegistry’s cache', (_, css) => {
    // A client component renders the same css through `StyledRenderer` with the
    // cache `StyleRegistry` provides, so a server component has to produce the
    // class that does. Both add the default declarations before compiling, as the
    // server layer does before calling `compileServerEmotionRule`.
    const cache = createCache({ key: 'meonode-css' })
    const client = renderToString(
      createElement(CacheProvider, { value: cache }, createElement(StyledRenderer, { element: 'div', css, children: 'x' } as never)),
    ).match(/class="([^"]*)"/)?.[1]
    expect(client).toMatch(/^meonode-css-[0-9a-z]{13}$/)
    expect(compileServerEmotionRule(ThemeUtil.resolveDefaultStyle(css as never))?.className).toBe(client)
  })

  it('compiles nothing for a value that is not an object or an array', () => {
    for (const value of ['color: red', 0, false, undefined]) {
      expect({ value, rule: compileServerEmotionRule(value as never) }).toEqual({ value, rule: undefined })
    }
  })

  it('keeps an array’s declarations together in one rule', () => {
    const rule = compileServerEmotionRule(ARRAY as never)
    expect(rule?.cssText).toContain('color:#112233')
    expect(rule?.cssText).toContain('padding:4px')
  })

  it('answers a repeated class with the same class and rule', () => {
    // Outside the RSC layer `React.cache` memoizes nothing, so each call here
    // compiles into a fresh cache. A repeat within one shared cache — several
    // elements, or several renders, of one class in a request — is covered by
    // the production-build suite's `/shared-class` and per-root pages.
    const first = compileServerEmotionRule({ color: '#445566' } as never)
    const second = compileServerEmotionRule({ color: '#445566' } as never)
    expect(second?.className).toBe(first?.className)
    expect(second?.cssText).toBe(first?.cssText)
    expect(second?.cssText).not.toBe('')
  })

  it('has a rule to render for css that styles something, named by the class it defines', () => {
    const rule = compileServerEmotionRule({ color: '#778899' } as never)
    expect(rule?.cssText).toContain(`.${rule?.ownClassName}{`)
    expect(rule?.ownClassName).toBe(rule?.className)
  })

  it('keeps a handed class out of the rule’s own class', () => {
    const rule = compileServerEmotionRule({ color: '#778899' } as never, 'utility')
    expect(rule?.className).toBe(`utility ${rule?.ownClassName}`)
    expect(rule?.ownClassName).toMatch(/^meonode-css-[a-z0-9]+$/)
  })
})

describe('a server render with no StyleRegistry', () => {
  function ServerDiv(props: { children?: string; className?: string }) {
    return createElement('div', props)
  }
  const WrappedDiv = createNode(ServerDiv)

  // With no registry nothing flushes a rule, so the render's own output has to
  // define every class it uses: `renderToString` in a Vite SSR app or a test.
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
