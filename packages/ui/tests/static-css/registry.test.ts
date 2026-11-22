// @vitest-environment jsdom
//
// The browser side of the static css registry. Compiled modules register their
// extracted rules once at load, which only records them; a render's
// `StaticStyles` inserts the classes its nodes use, which this file calls
// directly. The rules go into five bucket sheets per container, right before the
// tags of the Emotion cache MeoNode's rules go into.
import createCache from '@emotion/cache'
import { StyleSheet } from '@emotion/sheet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerStaticCss } from '@src/main.js'
import {
  __resetStaticCss,
  __setStaticCssSpeedy,
  type EmotionSheetPlacement,
  hasStaticCss,
  insertStaticClasses,
  splitRules,
  STATIC_CSS_PREFIX,
} from '@src/util/static-css.util.js'

const BASE = '.mn-0000000000001{color:red;}'
const OTHER_BASE = '.mn-0000000000002{margin:2px;}'
const HOVER = '.mn-0000000000003:hover{color:blue;}'
const MEDIA = '@media (min-width: 600px){.mn-0000000000004{padding:9px;}}'
const SELECTOR = '.mn-0000000000005 pre{color:green;}@media (min-width: 600px){.mn-0000000000005 pre{color:teal;}}'

/** Registers the five classes above, from two modules. */
function registerAll() {
  registerStaticCss('one', [
    [3, 'mn-0000000000004', MEDIA],
    [1, 'mn-0000000000001', BASE],
    [0, 'mn-0000000000005', SELECTOR],
  ])
  registerStaticCss('two', [
    [2, 'mn-0000000000003', HOVER],
    [1, 'mn-0000000000002', OTHER_BASE],
  ])
}

/** The bucket sheets of a container in document order, each as its rules' text. */
function buckets(root: ParentNode = document.head): { bucket: string | null; rules: string[] }[] {
  return [...root.querySelectorAll<HTMLStyleElement>('style[data-meonode-static]')].map(element => ({
    bucket: element.getAttribute('data-meonode-static'),
    rules: [...(element.sheet as CSSStyleSheet).cssRules].map(rule => rule.cssText.replace(/\s+/g, '')),
  }))
}

/** The head's children, each named by what it is. */
const order = (root: ParentNode = document.head) =>
  [...root.children].map(
    element =>
      (element.hasAttribute('data-meonode-static') && `static ${element.getAttribute('data-meonode-static')}`) ||
      element.getAttribute('data-emotion') ||
      element.getAttribute('data-name') ||
      element.tagName,
  )

const squash = (text: string) => text.replace(/\s+/g, '')
const sheetOf = (cache: { sheet: unknown }) => cache.sheet as unknown as EmotionSheetPlacement

/** A stylesheet of the page's own, as an app links or writes one. */
function userStyle(name: string): HTMLStyleElement {
  const element = document.createElement('style')
  element.setAttribute('data-name', name)
  element.textContent = '.card{padding:0}'
  document.head.append(element)
  return element
}

beforeEach(() => {
  __resetStaticCss()
  document.head.innerHTML = ''
})
afterEach(() => {
  vi.restoreAllMocks()
  __setStaticCssSpeedy()
})

// Production inserts through the CSSOM, development as text, as Emotion does; both
// keep the same buckets and order.
describe.each([
  ['through the CSSOM', true],
  ['as text', false],
])('inserting %s', (_, speedy) => {
  beforeEach(() => __setStaticCssSpeedy(speedy))

  it('uses that mechanism', () => {
    registerAll()
    insertStaticClasses(undefined, ['mn-0000000000001'])
    const element = document.head.querySelector<HTMLStyleElement>('style[data-meonode-static="1"]')!

    expect(element.textContent).toBe(speedy ? '' : BASE)
    expect(element.sheet!.cssRules).toHaveLength(1)
  })

  // Emotion inserts a node's rules when it renders, not when its module loads.
  it('inserts nothing when a module registers', () => {
    registerAll()
    expect(hasStaticCss()).toBe(true)
    expect(buckets()).toEqual([])
  })

  it('puts each class at the end of its bucket, in the order given, buckets in order', () => {
    registerAll()
    insertStaticClasses(undefined, ['mn-0000000000004', 'mn-0000000000002', 'mn-0000000000003'])
    insertStaticClasses(undefined, ['mn-0000000000001'])

    expect(buckets()).toEqual([
      { bucket: '0', rules: [] },
      { bucket: '1', rules: [squash(OTHER_BASE), squash(BASE)] },
      { bucket: '2', rules: [squash(HOVER)] },
      { bucket: '3', rules: [squash(MEDIA)] },
      { bucket: '4', rules: [] },
    ])
  })

  it('inserts a rule text holding several rules as each of them', () => {
    registerAll()
    insertStaticClasses(undefined, ['mn-0000000000005'])

    expect(splitRules(SELECTOR)).toHaveLength(2)
    expect(buckets()[0].rules).toEqual(splitRules(SELECTOR).map(squash))
  })

  it('inserts a class once, however often and from whichever module', () => {
    registerAll()
    registerStaticCss('three', [[1, 'mn-0000000000001', BASE]])
    insertStaticClasses(undefined, ['mn-0000000000001'])
    insertStaticClasses(undefined, ['mn-0000000000001', 'mn-0000000000002'])

    expect(buckets()[1].rules).toEqual([squash(BASE), squash(OTHER_BASE)])
  })

  // HMR re-evaluates a module, and two bundles can each evaluate one copy: the
  // same id with the same rules. The second registration does no work at all.
  it('takes a module registered again as already there, without reading its rules', () => {
    const rules: [number, string, string][] = [[1, 'mn-0000000000001', BASE]]
    registerStaticCss('one', rules)
    let reads = 0
    const again = new Proxy(rules, {
      get(target, key, receiver) {
        if (key === Symbol.iterator || key === 'length') reads++
        return Reflect.get(target, key, receiver)
      },
    })
    registerStaticCss('one', again)
    expect(reads).toBe(0)
  })

  it('throws in development for a class registered with another rule', () => {
    registerStaticCss('one', [[1, 'mn-0000000000001', BASE]])
    expect(() => registerStaticCss('two', [[1, 'mn-0000000000001', '.mn-0000000000001{color:blue;}']])).toThrow(
      /`mn-0000000000001` is registered with two different rules/,
    )
  })

  it('throws in development for a bucket out of range', () => {
    expect(() => registerStaticCss('one', [[5, 'mn-0000000000001', BASE]])).toThrow(/names bucket 5/)
  })

  // Moving a `<style>` drops the rules inserted through the CSSOM; they go in again.
  it('keeps every rule when a new cache needs the sheets elsewhere', () => {
    registerAll()
    userStyle('user')
    insertStaticClasses(sheetOf(createCache({ key: 'css' })), ['mn-0000000000001', 'mn-0000000000003'])
    const prepended = createCache({ key: 'css', prepend: true })
    insertStaticClasses(sheetOf(prepended), ['mn-0000000000002'])

    expect(order()).toEqual(['static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'user'])
    expect(buckets()[1].rules).toEqual([squash(BASE), squash(OTHER_BASE)])
    expect(buckets()[2].rules).toEqual([squash(HOVER)])
  })
})

describe('where the sheets go, for the cache MeoNode’s rules go into', () => {
  beforeEach(registerAll)

  // A cache that appends puts its first tag at the end of the head whenever it inserts it.
  it('leaves where a cache that appends puts its first tag to the cache', () => {
    const cache = createCache({ key: 'css' })
    insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])
    userStyle('later')
    cache.sheet.insert('.css-a{color:red}')

    expect(order()).toEqual(['static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'later', 'css'])
    expect(cache.sheet.insertionPoint).toBeUndefined()
  })

  // Two caches taking turns: the sheets come back where the first needs them.
  it('places the sheets for a cache seen again after another', () => {
    userStyle('user')
    const first = createCache({ key: 'css', prepend: true })
    insertStaticClasses(sheetOf(first), ['mn-0000000000001'])
    insertStaticClasses(sheetOf(createCache({ key: 'other' })), ['mn-0000000000002'])
    insertStaticClasses(sheetOf(first), ['mn-0000000000003'])
    first.sheet.insert('.css-a{color:red}')

    expect(order()).toEqual(['static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'css', 'user'])
  })

  it('at the end of the head with no cache, or one that appends and has no tags yet', () => {
    userStyle('user')
    const cache = createCache({ key: 'css' })
    insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])
    cache.sheet.insert('.css-a{color:red}')

    expect(order()).toEqual(['user', 'static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'css'])
  })

  it('right before the cache’s first tag', () => {
    const cache = createCache({ key: 'css' })
    cache.sheet.insert('.css-a{color:red}')
    userStyle('user')
    insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])

    expect(order()).toEqual(['static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'css', 'user'])
  })

  // MUI's `injectFirst`: the cache puts its first tag at the start of the head.
  describe('with a cache that prepends', () => {
    it('at the start, ahead of the page’s styles, when the cache has no tags yet; its tags then follow them', () => {
      userStyle('user')
      const cache = createCache({ key: 'css', prepend: true })
      insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])
      cache.sheet.insert('.css-a{color:red}')
      cache.sheet.insert('.css-b{color:blue}')

      expect(order()).toEqual(['static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'css', 'css', 'user'])
    })

    it('right before its tags when it has some', () => {
      userStyle('user')
      const cache = createCache({ key: 'css', prepend: true })
      cache.sheet.insert('.css-a{color:red}')
      insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])

      expect(order()).toEqual(['static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'css', 'user'])
    })
  })

  // Another library's prepended cache ahead of MeoNode's own: not the first `data-emotion` style.
  it('before MeoNode’s cache, not before another cache’s', () => {
    const mui = createCache({ key: 'mui', prepend: true })
    mui.sheet.insert('.mui-a{color:red}')
    userStyle('user')
    const own = createCache({ key: 'meonode-css' })
    insertStaticClasses(sheetOf(own), ['mn-0000000000001'])
    own.sheet.insert('.meonode-css-a{color:red}')

    expect(order()).toEqual(['mui', 'user', 'static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'meonode-css'])
  })

  it('right after an insertion point the app set, keeping its order', () => {
    const marker = document.createElement('meta')
    marker.setAttribute('data-name', 'marker')
    document.head.append(marker)
    userStyle('user')
    const cache = createCache({ key: 'css', insertionPoint: marker as unknown as HTMLElement })
    insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])
    cache.sheet.insert('.css-a{color:red}')

    expect(order()).toEqual(['marker', 'static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'css', 'user'])
  })

  // A cache that already has tags places its next one after its last; nothing to change.
  it('changes no insertion point of a cache that has tags', () => {
    const cache = createCache({ key: 'css', prepend: true })
    cache.sheet.insert('.css-a{color:red}')
    insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])
    expect(cache.sheet.insertionPoint).toBeUndefined()
  })

  // A remount with another cache, or a module replaced in development.
  it('follows a new cache for the same container', () => {
    userStyle('user')
    insertStaticClasses(sheetOf(createCache({ key: 'css' })), ['mn-0000000000001'])
    expect(order()).toEqual(['user', 'static 0', 'static 1', 'static 2', 'static 3', 'static 4'])

    const next = createCache({ key: 'next', prepend: true })
    insertStaticClasses(sheetOf(next), ['mn-0000000000002'])
    next.sheet.insert('.next-a{color:red}')

    expect(order()).toEqual(['static 0', 'static 1', 'static 2', 'static 3', 'static 4', 'next', 'user'])
    expect(buckets()[1].rules).toEqual([squash(BASE), squash(OTHER_BASE)])
  })
})

describe('a cache whose container is not the document head', () => {
  beforeEach(registerAll)

  // Emotion's rules go into the shadow root, where the document's sheets do not apply.
  it('gets its own sheets in a shadow root', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const cache = createCache({ key: 'css', container: shadow as unknown as Node })
    insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])

    expect(buckets(shadow)[1].rules).toEqual([squash(BASE)])
    expect(buckets()).toEqual([])
    host.remove()
  })

  // Inserting adopts an element made by another document, so which document makes it is not observable here.
  it('gets its own sheets in another document', () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const frameDocument = frame.contentDocument!
    const cache = createCache({ key: 'css', container: frameDocument.head })
    insertStaticClasses(sheetOf(cache), ['mn-0000000000001'])

    const sheets = [...frameDocument.head.querySelectorAll<HTMLStyleElement>('style[data-meonode-static]')]
    expect(sheets).toHaveLength(5)
    expect(sheets.every(element => element.ownerDocument === frameDocument)).toBe(true)
    expect(buckets(frameDocument.head)[1].rules).toEqual([squash(BASE)])
    expect(buckets()).toEqual([])
    frame.remove()
  })

  it('inserts each class once per container, into every container in use', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    insertStaticClasses(undefined, ['mn-0000000000001'])
    insertStaticClasses(sheetOf(createCache({ key: 'css', container: shadow as unknown as Node })), ['mn-0000000000001'])

    expect(buckets()[1].rules).toEqual([squash(BASE)])
    expect(buckets(shadow)[1].rules).toEqual([squash(BASE)])
    host.remove()
  })
})

// What the anchoring relies on: the installed `@emotion/sheet` reads
// `insertionPoint`, set after the sheet was made, when it inserts its first tag.
describe('@emotion/sheet', () => {
  it('reads an insertion point set before its first tag, when it inserts it', () => {
    const marker = document.createElement('meta')
    document.head.append(document.createElement('link'), marker, document.createElement('link'))
    const sheet = new StyleSheet({ key: 'pin', container: document.head })
    sheet.insertionPoint = marker
    sheet.insert('.pin{color:red}')

    expect(marker.nextElementSibling?.getAttribute('data-emotion')).toBe('pin')
  })
})

describe('a page the server rendered', () => {
  /** Hoisted styles as React writes them for the server's static css. */
  function serverStyles(groups: [bucket: number, classes: string[], text: string][]) {
    for (const [bucket, classes, text] of groups) {
      const element = document.createElement('style')
      element.setAttribute('data-precedence', `${STATIC_CSS_PREFIX}${bucket}`)
      element.setAttribute('data-href', [`${STATIC_CSS_PREFIX}${bucket}`, ...classes.map(className => `${STATIC_CSS_PREFIX}${className}`)].join(' '))
      element.textContent = text
      document.head.append(element)
    }
  }

  beforeEach(registerAll)

  it('keeps the classes the server sent, without inserting them again', () => {
    serverStyles([
      [0, [], ''],
      [1, ['mn-0000000000001'], BASE],
      [2, [], ''],
      [3, [], ''],
      [4, [], ''],
    ])
    insertStaticClasses(undefined, ['mn-0000000000001'])

    expect(buckets().every(sheet => sheet.rules.length === 0)).toBe(true)
  })

  it('places its own sheets after the server’s styles of each bucket', () => {
    serverStyles([
      [0, [], ''],
      [1, ['mn-0000000000001'], BASE],
      [2, [], ''],
      [3, [], ''],
      [4, [], ''],
    ])
    insertStaticClasses(undefined, ['mn-0000000000001', 'mn-0000000000004', 'mn-0000000000002'])

    const placed = [...document.head.children].map(element => element.getAttribute('data-precedence') ?? `own ${element.getAttribute('data-meonode-static')}`)
    expect(placed).toEqual([
      `${STATIC_CSS_PREFIX}0`,
      'own 0',
      `${STATIC_CSS_PREFIX}1`,
      'own 1',
      `${STATIC_CSS_PREFIX}2`,
      'own 2',
      `${STATIC_CSS_PREFIX}3`,
      'own 3',
      `${STATIC_CSS_PREFIX}4`,
      'own 4',
    ])
    expect(buckets().map(sheet => sheet.rules)).toEqual([[], [squash(OTHER_BASE)], [], [squash(MEDIA)], []])
  })
})
