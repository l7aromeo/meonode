// @vitest-environment node
//
// A server with no document, as in production: registration only records the
// rules, and a render sends the ones its nodes use as React hoistable styles,
// before Emotion's inline rules for the css left on the runtime path.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Div, Node } from '@src/main.js'
import { __resetStaticStyles } from '@src/components/static-styles.js'
import { __resetStaticCss, __staticClassListMemoSize, registerStaticCss, STATIC_CLASS_LIST_MEMO_ENTRIES } from '@src/util/static-css.util.js'

const RED = 'mn-000000000000r'
const MEDIA = 'mn-000000000000m'

const page = (body: ReturnType<typeof Div>) =>
  renderToString(createElement('html', null, createElement('head', null), createElement('body', null, body.render())))

beforeEach(() => {
  __resetStaticCss()
  __resetStaticStyles()
  registerStaticCss('page', [
    [0, RED, `.${RED}{color:red;}`],
    [2, MEDIA, `@media (min-width: 600px){.${MEDIA}{padding:9px;}}`],
  ])
})
afterEach(() => vi.restoreAllMocks())

describe('a server render with no document', () => {
  it('sends the static rules in the head, and Emotion’s rule beside its element', () => {
    const html = page(Div({ __meo$: 2, __meo$s: `${RED} ${MEDIA}`, __meo$c: { margin: 2 }, children: 'x' } as never))

    expect(html).toMatch(
      new RegExp(
        '^<html><head>' +
          '<style data-precedence="mn-static-0" data-href="mn-static-0 mn-static-page-0">\\.mn-000000000000r\\{color:red;\\}</style>' +
          '<style data-precedence="mn-static-1" data-href="mn-static-1"></style>' +
          '<style data-precedence="mn-static-2" data-href="mn-static-2 mn-static-page-2">@media \\(min-width: 600px\\)\\{\\.mn-000000000000m\\{padding:9px;\\}\\}</style>' +
          '<style data-precedence="mn-static-3" data-href="mn-static-3"></style>' +
          '</head><body><style data-emotion="css [0-9a-z]+">[^<]*margin:2px;[^<]*</style>' +
          // The slot after the text renders nothing; React separates the text from it.
          `<div class="${RED} ${MEDIA} css-[0-9a-z]+">x<!-- --></div></body></html>$`,
      ),
    )
  })

  it('keeps the buckets in order when the first module a render meets has only a later bucket', () => {
    registerStaticCss('media-only', [[2, 'mn-00000000000m2', '@media print{.mn-00000000000m2{color:black;}}']])
    registerStaticCss('base-only', [[0, 'mn-00000000000b0', '.mn-00000000000b0{color:white;}']])
    const html = page(Div({ __meo$: 2, __meo$s: 'mn-00000000000m2 mn-00000000000b0' } as never))
    const precedences = [...html.matchAll(/data-precedence="([^"]+)"/g)].map(match => match[1])

    expect(precedences).toEqual(['mn-static-0', 'mn-static-1', 'mn-static-2', 'mn-static-3'])
  })

  it('sends a module once however many nodes use it', () => {
    const html = page(Div({ children: [1, 2, 3].map(key => Div({ __meo$: 2, __meo$s: RED, key } as never)) }))

    expect(html.match(/mn-static-page-0/g)).toHaveLength(1)
  })

  it('sends nothing for a render without static classes', () => {
    expect(page(Div({ children: 'x' }))).toBe('<html><head></head><body><div>x</div></body></html>')
  })

  it('says in development when a class no module registered is used', () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(String(args[0])))
    page(Div({ __meo$: 2, __meo$s: 'mn-00000000000zz', children: 'x' } as never))

    expect(errors.some(error => error.includes('`mn-00000000000zz` is used but no module registered it'))).toBe(true)
  })

  it(`remembers at most ${STATIC_CLASS_LIST_MEMO_ENTRIES} class lists`, () => {
    // A conditional class list has one string per combination; these are all different.
    let most = 0
    for (let i = 0; i < STATIC_CLASS_LIST_MEMO_ENTRIES * 2 + 5; i++) {
      renderToString(Div({ __meo$: 2, __meo$s: `${RED}${' '.repeat(1 + (i % 7))}${i % 2 ? MEDIA : ''}${' '.repeat(i)}` } as never).render())
      most = Math.max(most, __staticClassListMemoSize())
    }

    expect(most).toBe(STATIC_CLASS_LIST_MEMO_ENTRIES)
  }, 60_000)

  it('emits the module of a component’s own render too', () => {
    const Card = () => Div({ __meo$: 2, __meo$s: MEDIA, children: 'card' } as never).render()
    const html = page(Div({ children: Node(Card) }))

    expect(html).toContain('data-href="mn-static-2 mn-static-page-2"')
  })
})
