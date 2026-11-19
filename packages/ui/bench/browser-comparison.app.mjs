// App-shaped trees for `browser-comparison.page.mjs`, built through whichever
// `@meonode/ui` build is passed in.
//
// `appOf` is about 10k nodes, 31 levels deep, with a component boundary every
// 3 levels, a ThemeProvider at the root and one inner provider, and css that
// differs on every node, so no two nodes share a rule. `App` holds a version;
// bumping it changes a value in 30% of the nodes' css. `flatThemedOf` is 10k
// styled spans under a ThemeProvider, laid out as rows.
import { createElement, useState } from 'react'

/** Columns of the app's root grid. */
export const COLUMNS = 12
/** Levels below each column's root. */
export const DEPTH = 30
/** Leaves on every level. */
export const LEAVES = 27
/** The column rendered under the inner provider. */
const INNER_COLUMN = 6
/** Nodes of the flat themed tree. */
export const FLAT_THEMED_NODES = 10000
/** Share of the app's nodes whose css changes on a bump, out of ten. */
const BUMPED_TENTHS = 3

/**
 * The css of node `i` at version `v`: its colour alone is unique below 63k
 * nodes. Every fifth node reads a theme token, every fourth sets `display`,
 * every sixth has a hover rule and every seventh a media query on a token.
 */
export function cssOf(i, v) {
  const tone = i % 10 < BUMPED_TENTHS ? v : 0
  const css = {
    paddingLeft: `${(i % 97) + 1}px`,
    paddingTop: `${(Math.floor(i / 97) % 31) + 1}px`,
    color: `rgb(${i % 251}, ${(i * 7 + tone * 31) % 253}, ${(i * 13) % 255})`,
  }
  if (i % 5 === 0) css.borderColor = 'theme.c.a'
  if (i % 4 === 0) css.display = i % 8 === 0 ? 'flex' : 'block'
  if (i % 6 === 0) css['&:hover'] = { opacity: ((i % 90) + 10) / 100 }
  if (i % 7 === 0) css['@media (min-width: theme.s.md)'] = { marginLeft: `${(i % 23) + 1}px` }
  return css
}

const theme = (ThemeProvider, tokens, children, key) => ThemeProvider({ key, tokens, modes: ['light'], defaultMode: 'light', children })

/**
 * The app for one build. Its components are made once per build, so they keep
 * their identity across mounts.
 * @returns `element()` makes the root element; `bump()` changes the version of
 * the mounted app.
 */
export function appOf({ Div, Span, Node, ThemeProvider }) {
  const outer = { c: { a: 'rgb(10, 20, 30)' }, s: { md: '600px' } }
  const inner = { c: { a: 'rgb(70, 80, 90)' }, s: { md: '700px' } }

  /** Three levels of one column: a styled node per level with its leaves, and the next block below. */
  function Block({ col, level, v }) {
    let below = level + 3 < DEPTH ? Node(Block, { key: 'below', col, level: level + 3, v }) : null
    for (let l = Math.min(level + 2, DEPTH - 1); l >= level; l--) {
      const id = (col * DEPTH + l) * (LEAVES + 1)
      const leaves = Array.from({ length: LEAVES }, (_, k) => Span(`${k}`, { key: k, css: cssOf(id + 1 + k, v) }))
      below = Div({ key: 'below', css: cssOf(id, v), children: below ? [...leaves, below] : leaves })
    }
    return below.render()
  }

  const state = { set: () => {} }
  function App() {
    const [v, setV] = useState(0)
    state.set = setV
    const columns = Array.from({ length: COLUMNS }, (_, col) =>
      col === INNER_COLUMN ? theme(ThemeProvider, inner, Node(Block, { col, level: 0, v }), col) : Node(Block, { key: col, col, level: 0, v }),
    )
    return theme(ThemeProvider, outer, Div({ css: { display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }, children: columns })).render()
  }
  return { element: () => createElement(App), bump: () => state.set(v => v + 1) }
}

/** 10k styled spans under a ThemeProvider, as rows. Building it is part of every mount. */
export function flatThemedOf({ Div, Span, ThemeProvider }) {
  return {
    element: () =>
      theme(
        ThemeProvider,
        { c: { a: 'red' } },
        Div({ className: 'list', children: Array.from({ length: FLAT_THEMED_NODES }, (_, i) => Span(`n${i}`, { key: i, padding: '1px' })) }),
      ).render(),
    bump: null,
  }
}
