// @vitest-environment jsdom
//
// A page whose Suspense boundary the server streams after the shell, with a
// static class of its own. React's streaming runtime puts the boundary's
// hoistable style beside the styles of its precedence, after the page's first
// insertion read the ones the shell sent; once the boundary hydrates, its class
// must count as sent, so its rule is on the page once, in its bucket's place.
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { __resetStaticCss } from '@src/util/static-css.util.js'
import { LATE, Page, register, SHELL } from './_static-stream.js'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** The head's styles, named by what they are. */
const head = () =>
  [...document.head.querySelectorAll('style')].map(element => {
    const precedence = element.getAttribute('data-precedence')
    if (precedence) return element.textContent ? `${precedence}:${element.textContent}` : precedence
    if (element.hasAttribute('data-meonode-static')) return `sheet-${element.getAttribute('data-meonode-static')}`
    return element.getAttribute('data-emotion')?.split(' ')[0] ?? element.getAttribute('data-name')
  })

/** How many rules on the page style `className`. */
const rulesOf = (className: string) =>
  [...document.querySelectorAll('style')].flatMap(element => [...(element.sheet?.cssRules ?? [])]).filter(rule => rule.cssText.includes(className)).length

afterEach(() => {
  delete (document as { readyState?: unknown }).readyState
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  __resetStaticCss()
})

describe('a Suspense boundary streamed after the shell', () => {
  it.each([
    ['a page rendered as a fragment', 'fragment'],
    ['a whole document', 'document'],
    ['a page rendered as a fragment whose shell has no static node', 'fragment-bare'],
    ['a whole document whose shell has no static node', 'document-bare'],
  ])('has its static rule on the page once, in its bucket, in %s', async (_, mode) => {
    const streamed = JSON.parse(execFileSync('bun', [join(import.meta.dirname, '_static-stream.ts'), mode], { encoding: 'utf8' })) as {
      shell: string
      completion: string
    }
    // The document is loading while the stream is open; React client-renders a
    // boundary still pending once it is not.
    let readyState: DocumentReadyState = 'loading'
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => readyState })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    __resetStaticCss()
    register()
    const user = '<style data-name="user">.card{padding:0}</style>'
    document.open()
    if (mode.startsWith('document')) document.write(streamed.shell.replace('<head>', `<head>${user}`))
    else document.write(`<!doctype html><html><head>${user}</head><body><div id="root">${streamed.shell}</div></body></html>`)
    document.close()

    let resolveData!: (text: string) => void
    const data = new Promise<string>(resolve => (resolveData = resolve))
    const errors: unknown[] = []
    const app = createElement(CacheProvider, { value: createCache({ key: 'css', speedy: true }) }, createElement(Page, { data, mode }))
    const root = hydrateRoot(mode.startsWith('document') ? document : document.getElementById('root')!, app, {
      onRecoverableError: error => errors.push(error),
    })
    try {
      await wait(30)
      // The chunk completing the boundary: its content, its style, and React's scripts.
      const holder = document.createElement('div')
      holder.innerHTML = streamed.completion
      let server: Element | null = null
      for (const node of [...holder.childNodes]) {
        if (node.nodeName === 'SCRIPT') new Function((node as HTMLScriptElement).text)()
        else server = (document.body.appendChild(node) as Element).querySelector?.('#late') ?? server
      }
      // React reveals a streamed boundary after a short batching delay.
      await wait(600)
      readyState = 'complete'
      resolveData('late')
      await data
      await wait(50)

      expect(errors).toEqual([])
      // The boundary hydrated the server's content rather than rendering its own.
      expect(server).not.toBeNull()
      expect(document.getElementById('late')).toBe(server)
      expect(rulesOf(LATE)).toBe(1)
      if (!mode.endsWith('bare')) expect(rulesOf(SHELL)).toBe(1)
      const shell = mode.endsWith('bare') ? [] : [`mn-static-1:.${SHELL}{padding:1px;}`]
      expect(head()).toEqual([
        'user',
        'mn-static-0',
        'sheet-0',
        ...shell,
        `mn-static-1:.${LATE}{padding:2px;}`,
        'sheet-1',
        'mn-static-2',
        'sheet-2',
        'mn-static-3',
        'sheet-3',
        'mn-static-4',
        'sheet-4',
        'css',
      ])
    } finally {
      root.unmount()
    }
  }, 20000)
})
