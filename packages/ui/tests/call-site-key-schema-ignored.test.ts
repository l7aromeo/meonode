// @vitest-environment jsdom
//
// Schema 3 of the compiled marker contract: a call-site key with no `c`/`d`
// buckets, emitted for call sites the plugin can key but cannot partition.
//
// The key is no longer read. It existed to disambiguate entries in
// a global element cache, which derived an identity for every memoized node
// from its props and its position, and so needed help telling two structurally
// identical subtrees apart. Memoized subtrees now live in fibers of their own,
// so React supplies identity and nothing is derived.
//
// What still has to hold is compatibility: a bundle compiled by any released
// plugin version must render correctly on this runtime, with every marker prop
// consumed rather than forwarded. `k` and `dyn` are accepted and dropped.
import { render, cleanup } from '@testing-library/react'
import { Div } from '@src/main.js'
import { COMPILED_MARKER, COMPILER_SCHEMA_KEYS } from '@src/constant/common.const.js'

const SK = COMPILER_SCHEMA_KEYS[2]

afterEach(cleanup)

describe('schema 3 — call-site key only', () => {
  it('renders and classifies props with no buckets present', () => {
    const { container } = render(Div({ [COMPILED_MARKER]: 3, [SK.key]: 'site-a', padding: '8px', id: 'target', children: 'hi' } as never).render())
    const el = container.querySelector('#target') as HTMLElement

    expect(el).not.toBeNull()
    expect(el.textContent).toBe('hi')
    // `padding` became an Emotion class, not a DOM attribute.
    expect(el.getAttribute('padding')).toBeNull()
    expect(el.className).toMatch(/css-/)
  })

  it('consumes every marker prop instead of forwarding it', () => {
    const { container } = render(Div({ [COMPILED_MARKER]: 3, [SK.key]: 'site-a', [SK.dyn]: ['id'], id: 'target', children: 'hi' } as never).render())
    const el = container.querySelector('#target') as HTMLElement

    expect(el.outerHTML).not.toContain(COMPILED_MARKER)
    for (const name of [SK.key, SK.dyn, SK.css, SK.dom]) {
      expect(el.getAttribute(name)).toBeNull()
    }
  })

  it('renders identically whether or not the call site was keyed', () => {
    // The key is inert, so a keyed and an unkeyed call site must agree.
    const keyed = render(Div({ [COMPILED_MARKER]: 3, [SK.key]: 'site-a', padding: '8px', children: 'hi' } as never).render())
    const keyedHtml = keyed.container.innerHTML
    cleanup()

    const plain = render(Div({ padding: '8px', children: 'hi' }).render())

    expect(plain.container.innerHTML).toBe(keyedHtml)
  })
})
