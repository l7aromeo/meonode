// @vitest-environment node
//
// A factory's `css` and a call site's `css` combine the way its flat CSS props
// already do: key by key, recursing into nested selectors and at-rules, with the
// call site winning a conflict. Before this, `css` was one key in a shallow
// spread, so a call site that added a single rule dropped every pseudo-class,
// media query and `@supports` fallback the factory had defined.
//
// Asserted on server-rendered CSS rather than on props, because the property
// that matters is what reaches the stylesheet. Runs unchanged under
// `test:compiled`, which is the point of the last case: a user-defined factory
// is not rewritten by the compiler, so its call sites arrive flat in both modes,
// and the one shape the compiler can produce for them — a bucketed call from a
// module registered in `factoryModules` — is built here by hand from the shape
// the compiler was measured to emit for `Div`.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { css as emotionCss } from '@emotion/react'
import { createChildrenFirstNode, createNode, ThemeProvider } from '@src/main.js'

/** Every rule Emotion inlined into the server render, in order. */
const cssOf = (node: { render(): unknown }): string =>
  [...renderToString(node.render() as never).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('')

/** The declarations inside the first block whose selector ends with `suffix`. */
const block = (css: string, suffix: string): string => {
  const at = css.indexOf(`${suffix}{`)
  if (at < 0) throw new Error(`no block for ${suffix} in:\n${css}`)
  return css.slice(at + suffix.length + 1, css.indexOf('}', at))
}

const FACTORY_CSS = {
  '&:hover': { color: 'blue' },
  '@supports not (backdrop-filter: blur(1px))': { background: 'white' },
}

describe('createNode: a call-site css extends the factory css', () => {
  it('keeps the factory rules the issue reported losing', () => {
    const Card = createNode('div', { padding: 24, css: FACTORY_CSS })
    const css = cssOf(Card({ css: { margin: 4 }, children: 'x' }))

    expect(css).toContain('margin:4px')
    expect(css).toContain('padding:24px')
    expect(css).toMatch(/:hover\{color:blue;\}/)
    expect(css).toContain('@supports not (backdrop-filter: blur(1px))')
  })

  it('keeps nested selectors from both sides', () => {
    const Card = createNode('div', { css: { '&:hover': { color: 'blue' } } })
    const css = cssOf(Card({ css: { '&:focus': { color: 'red' } }, children: 'x' }))

    expect(css).toMatch(/:hover\{color:blue;\}/)
    expect(css).toMatch(/:focus\{color:red;\}/)
  })

  it('merges inside a shared selector, the call site winning the conflict', () => {
    // Key by key, not selector by selector: the call site's `color` replaces the
    // factory's, and the factory's `background` in the same block survives.
    const Card = createNode('div', { css: { '&:hover': { color: 'blue', background: 'grey' } } })
    const hover = block(cssOf(Card({ css: { '&:hover': { color: 'red' } }, children: 'x' })), ':hover')

    expect(hover).toContain('color:red')
    expect(hover).toContain('background:grey')
    expect(hover).not.toContain('color:blue')
  })

  it('merges inside a shared at-rule', () => {
    const query = '@media (min-width: 600px)'
    const Card = createNode('div', { css: { [query]: { padding: 8 } } })
    const css = cssOf(Card({ css: { [query]: { margin: 2 } }, children: 'x' }))
    const inQuery = css.slice(css.indexOf(query))

    expect(css.split(query)).toHaveLength(2)
    expect(inQuery).toContain('padding:8px')
    expect(inQuery).toContain('margin:2px')
  })

  it('resolves theme tokens from both sides', () => {
    const Card = createNode('div', { css: { '&:hover': { color: 'theme.colors.primary' } } })
    const css = cssOf(
      ThemeProvider({
        tokens: { colors: { primary: 'red', accent: 'green' } },
        modes: ['light', 'dark'],
        defaultMode: 'light',
        children: Card({ css: { '&:focus': { color: 'theme.colors.accent' } }, children: 'x' }),
      } as never),
    )

    expect(css).toMatch(/:hover\{color:var\(--meonode-theme-colors-primary\);\}/)
    expect(css).toMatch(/:focus\{color:var\(--meonode-theme-colors-accent\);\}/)
  })

  it('does not write a call site back into the factory', () => {
    // The factory's `css` is one object shared by every call. A merge that
    // wrote into it would leak one call's rules into every later render.
    const Card = createNode('div', { css: { '&:hover': { color: 'blue' } } })
    cssOf(Card({ css: { '&:hover': { background: 'red' }, '&:focus': { color: 'red' } }, children: 'x' }))
    const later = cssOf(Card({ children: 'x' }))

    expect(later).not.toContain('background:red')
    expect(later).not.toContain(':focus')
    expect(block(later, ':hover')).toBe('color:blue;')
  })

  it('lets a call site remove one factory rule by setting it to undefined', () => {
    // The same semantics a flat prop has: an explicit `undefined` wins. It is
    // the way to opt out of a single factory rule without losing the rest.
    const Card = createNode('div', { css: FACTORY_CSS })
    const css = cssOf(Card({ css: { '&:hover': undefined }, children: 'x' }))

    expect(css).not.toContain(':hover')
    expect(css).toContain('@supports not (backdrop-filter: blur(1px))')
  })

  it('passes a call-site css that is not a plain object through untouched', () => {
    // Only two plain objects can be merged key by key. Anything else — here an
    // Emotion `css()` result — is left exactly as the call site wrote it, which
    // means the factory's rules are *not* kept in this case. That is today's
    // behaviour, kept on purpose rather than endorsed: the only way to combine
    // the two would be to hand Emotion an array, and the runtime currently
    // spreads an array `css` into an object keyed "0", "1"… so composing would
    // emit rules for descendant selectors that never match. What is asserted is
    // the part this change owns — the merge does not mangle a value it cannot
    // merge.
    const Card = createNode('div', { css: { '&:hover': { color: 'blue' } } })

    expect(cssOf(Card({ css: emotionCss({ margin: 4 }) as never, children: 'x' }))).toContain('margin:4px')
  })

  it('keeps a factory css() result from swallowing the call site', () => {
    // The case that shows why `css()` output is not merged. It is a plain object
    // literal, so a merge would happily build `{ name, styles, …, margin }` — and
    // Emotion serialises any object carrying a `styles` string by using that
    // string alone. The call site's rules, and the defaults the runtime adds,
    // would vanish. Left unmerged, the call site wins exactly as it did before
    // this change: this output is byte-identical to the unfixed runtime's.
    const Card = createNode('div', { css: emotionCss({ padding: 24 }) as never })
    const css = cssOf(Card({ css: { margin: 4 }, children: 'x' }))

    expect(css).toContain('margin:4px')
    expect(css).toContain('min-width:0')
  })

  it('leaves the factory css alone when the call site has none', () => {
    const Card = createNode('div', { css: FACTORY_CSS })
    const css = cssOf(Card({ margin: 4, children: 'x' }))

    expect(css).toMatch(/:hover\{color:blue;\}/)
    expect(css).toContain('@supports not (backdrop-filter: blur(1px))')
  })

  it('uses the call-site css as-is when the factory has none', () => {
    const Card = createNode('div', { padding: 24 })

    expect(cssOf(Card({ css: { '&:focus': { color: 'red' } }, children: 'x' }))).toMatch(/:focus\{color:red;\}/)
  })

  it('merges a call site that arrives already partitioned by the compiler', () => {
    // The shape `@meonode/compiler` emits for a call to a registered factory,
    // copied from its measured output for `Div`: flat CSS props in `__meo$c`,
    // DOM props in `__meo$d`, and `css` left top-level as a plain object.
    const Card = createNode('div', { padding: 24, css: FACTORY_CSS })
    const css = cssOf(
      Card({
        __meo$: 2,
        __meo$c: { margin: 4 },
        __meo$d: { id: 'c' },
        __meo$k: 'probe',
        __meo$dyn: ['css'],
        css: { '&:focus': { color: 'red' } },
        children: 'x',
      } as never),
    )

    expect(css).toContain('margin:4px')
    expect(css).toMatch(/:hover\{color:blue;\}/)
    expect(css).toMatch(/:focus\{color:red;\}/)
    expect(css).toContain('@supports not (backdrop-filter: blur(1px))')
  })
})

describe('createChildrenFirstNode: the same merge', () => {
  it('keeps the factory rules', () => {
    const Title = createChildrenFirstNode('h2', { padding: 24, css: FACTORY_CSS })
    const css = cssOf(Title('x', { css: { margin: 4 } }))

    expect(css).toContain('margin:4px')
    expect(css).toMatch(/:hover\{color:blue;\}/)
    expect(css).toContain('@supports not (backdrop-filter: blur(1px))')
  })

  it('merges inside a shared selector, the call site winning the conflict', () => {
    const Title = createChildrenFirstNode('h2', { css: { '&:hover': { color: 'blue', background: 'grey' } } })
    const hover = block(cssOf(Title('x', { css: { '&:hover': { color: 'red' } } })), ':hover')

    expect(hover).toContain('color:red')
    expect(hover).toContain('background:grey')
    expect(hover).not.toContain('color:blue')
  })
})
