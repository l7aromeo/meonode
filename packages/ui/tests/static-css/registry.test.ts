// @vitest-environment jsdom
//
// The browser side of the static css registry: compiled modules register their
// extracted rules once at load, and the rules go into four bucket sheets, in
// bucket order across modules, before Emotion's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerStaticCss } from '@src/main.js'
import { __resetStaticCss, __setStaticCssSpeedy, hasStaticCss, splitRules, STATIC_CSS_PREFIX } from '@src/util/static-css.util.js'

const BASE = '.mn-0000000000001{color:red;}'
const OTHER_BASE = '.mn-0000000000002{margin:2px;}'
const HOVER = '.mn-0000000000003:hover{color:blue;}'
const MEDIA = '@media (min-width: 600px){.mn-0000000000004{padding:9px;}}'
const SELECTOR = '.mn-0000000000005 pre{color:green;}@media (min-width: 600px){.mn-0000000000005 pre{color:teal;}}'

/** The bucket sheets in document order, each as its rules' text. */
function buckets(): { bucket: string | null; rules: string[] }[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>('style[data-meonode-static]')].map(element => ({
    bucket: element.getAttribute('data-meonode-static'),
    rules: [...(element.sheet as CSSStyleSheet).cssRules].map(rule => rule.cssText.replace(/\s+/g, '')),
  }))
}

const squash = (text: string) => text.replace(/\s+/g, '')

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
    registerStaticCss('one', [[0, 'mn-0000000000001', BASE]])
    const element = document.head.querySelector<HTMLStyleElement>('style[data-meonode-static="0"]')!

    expect(element.textContent).toBe(speedy ? '' : BASE)
    expect(element.sheet!.cssRules).toHaveLength(1)
  })

  describe('registering static css in the browser', () => {
    it('puts each rule at the end of its bucket, buckets in order', () => {
      registerStaticCss('one', [
        [2, 'mn-0000000000004', MEDIA],
        [0, 'mn-0000000000001', BASE],
      ])
      // A later module's base rule still lands before the earlier module's at-rule.
      registerStaticCss('two', [
        [1, 'mn-0000000000003', HOVER],
        [0, 'mn-0000000000002', OTHER_BASE],
      ])

      expect(buckets()).toEqual([
        { bucket: '0', rules: [squash(BASE), squash(OTHER_BASE)] },
        { bucket: '1', rules: [squash(HOVER)] },
        { bucket: '2', rules: [squash(MEDIA)] },
        { bucket: '3', rules: [] },
      ])
      expect(hasStaticCss()).toBe(true)
    })

    it('inserts a rule text holding several rules as each of them', () => {
      registerStaticCss('one', [[3, 'mn-0000000000005', SELECTOR]])

      expect(splitRules(SELECTOR)).toHaveLength(2)
      expect(buckets()[3].rules).toEqual(splitRules(SELECTOR).map(squash))
    })

    it('registers a module once, and a class once across modules', () => {
      registerStaticCss('one', [[0, 'mn-0000000000001', BASE]])
      registerStaticCss('one', [[0, 'mn-0000000000001', BASE]])
      registerStaticCss('two', [
        [0, 'mn-0000000000001', BASE],
        [0, 'mn-0000000000002', OTHER_BASE],
      ])

      expect(buckets()[0].rules).toEqual([squash(BASE), squash(OTHER_BASE)])
    })

    it('goes before the first Emotion sheet', () => {
      const emotion = document.createElement('style')
      emotion.setAttribute('data-emotion', 'meonode-css')
      document.head.append(emotion)
      registerStaticCss('one', [[0, 'mn-0000000000001', BASE]])

      const order = [...document.head.children].map(element => element.getAttribute('data-meonode-static') ?? element.getAttribute('data-emotion'))
      expect(order).toEqual(['0', '1', '2', '3', 'meonode-css'])
    })

    it('creates no sheet until a rule needs one', () => {
      expect(hasStaticCss()).toBe(false)
      registerStaticCss('empty', [])

      expect(buckets()).toEqual([])
    })

    it('throws in development for a class registered with another rule', () => {
      registerStaticCss('one', [[0, 'mn-0000000000001', BASE]])

      expect(() => registerStaticCss('two', [[0, 'mn-0000000000001', '.mn-0000000000001{color:blue;}']])).toThrow(
        /`mn-0000000000001` is registered with two different rules/,
      )
      // The first rule stays.
      expect(buckets()[0].rules).toEqual([squash(BASE)])
    })

    it('throws in development for a bucket out of range', () => {
      expect(() => registerStaticCss('one', [[4, 'mn-0000000000001', BASE]])).toThrow(/names bucket 4/)
    })
  })

  describe('a page the server rendered', () => {
    /** Hoisted styles as React writes them for the server's static css. */
    function serverStyles(groups: [bucket: number, hrefs: string[], text: string][]) {
      for (const [bucket, hrefs, text] of groups) {
        const element = document.createElement('style')
        element.setAttribute('data-precedence', `${STATIC_CSS_PREFIX}${bucket}`)
        element.setAttribute('data-href', hrefs.join(' '))
        element.textContent = text
        document.head.append(element)
      }
    }

    it('keeps the modules the server sent, without inserting them again', () => {
      serverStyles([
        [0, [`${STATIC_CSS_PREFIX}0`, `${STATIC_CSS_PREFIX}one-0`], BASE],
        [1, [`${STATIC_CSS_PREFIX}1`], ''],
        [2, [`${STATIC_CSS_PREFIX}2`], ''],
        [3, [`${STATIC_CSS_PREFIX}3`], ''],
      ])
      registerStaticCss('one', [[0, 'mn-0000000000001', BASE]])

      expect(buckets()).toEqual([])
    })

    it('places its own sheets after the server’s styles of each bucket', () => {
      serverStyles([
        [0, [`${STATIC_CSS_PREFIX}0`, `${STATIC_CSS_PREFIX}one-0`], BASE],
        [1, [`${STATIC_CSS_PREFIX}1`], ''],
        [2, [`${STATIC_CSS_PREFIX}2`], ''],
        [3, [`${STATIC_CSS_PREFIX}3`], ''],
      ])
      registerStaticCss('one', [[0, 'mn-0000000000001', BASE]])
      registerStaticCss('two', [
        [0, 'mn-0000000000001', BASE],
        [2, 'mn-0000000000004', MEDIA],
        [0, 'mn-0000000000002', OTHER_BASE],
      ])

      const order = [...document.head.children].map(element => element.getAttribute('data-precedence') ?? `own ${element.getAttribute('data-meonode-static')}`)
      expect(order).toEqual([
        `${STATIC_CSS_PREFIX}0`,
        'own 0',
        `${STATIC_CSS_PREFIX}1`,
        'own 1',
        `${STATIC_CSS_PREFIX}2`,
        'own 2',
        `${STATIC_CSS_PREFIX}3`,
        'own 3',
      ])
      // The class the server's module already defined is not inserted again.
      expect(buckets().map(sheet => sheet.rules)).toEqual([[squash(OTHER_BASE)], [], [squash(MEDIA)], []])
    })
  })
})
