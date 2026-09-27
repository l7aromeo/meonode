// @vitest-environment node
//
// meonode creates its server Emotion caches on their own plugins array, holding a
// copy of Emotion's vendor prefixer, so the rules Emotion memoizes go with each
// cache. That is only sound while the copy writes exactly what Emotion's own
// default plugins write; this fails the day an Emotion release changes them.
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { prefixer as stylisPrefixer } from 'stylis'
import { describe, expect, it } from 'vitest'
import { prefixer } from '@src/util/emotion-prefixer.util.js'

/** Every declaration and selector shape either Emotion's prefixer or stylis's handles. */
const CORPUS: Record<string, unknown>[] = [
  { colorAdjust: 'exact' },
  { animation: 'x 1s' },
  { animationName: 'x' },
  { textDecoration: 'underline' },
  { filter: 'blur(1px)' },
  { clipPath: 'circle()' },
  { backfaceVisibility: 'hidden' },
  { columns: 2 },
  { columnGap: 4 },
  { boxDecorationBreak: 'clone' },
  { mask: 'url(a.svg)' },
  { maskImage: 'none' },
  { maskComposite: 'add' },
  { backgroundClip: 'text' },
  { tabSize: 4 },
  { appearance: 'none' },
  { userSelect: 'none' },
  { transform: 'scale(2)' },
  { hyphens: 'auto' },
  { textSizeAdjust: '100%' },
  { flex: 1 },
  { flexDirection: 'column' },
  { scrollSnapType: 'x mandatory' },
  { order: 2 },
  { alignItems: 'center' },
  { alignSelf: 'flex-start' },
  { alignSelf: 'baseline' },
  { alignContent: 'space-between' },
  { flexShrink: 0 },
  { flexBasis: '10%' },
  { flexGrow: 1 },
  { transition: 'transform 1s' },
  { cursor: 'zoom-in' },
  { cursor: 'grab' },
  { backgroundImage: 'image-set("a.png" 1x)' },
  { background: 'image-set("a.png" 1x)' },
  { justifyContent: 'space-between' },
  { justifyContent: 'flex-start' },
  { justifySelf: 'center' },
  { gridTemplateColumns: '1fr 1fr' },
  { gridTemplateRows: 'auto' },
  { gridRowStart: 1, gridRowEnd: 3 },
  { gridColumnStart: 2 },
  { gridColumnEnd: 'span 2' },
  { gridColumn: '1 / 3' },
  { gridRow: '2 / span 2' },
  { marginInlineStart: 4 },
  { paddingInlineEnd: 4 },
  { width: 'max-content' },
  { minWidth: 'min-content' },
  { maxWidth: 'fit-content' },
  { height: 'fill-available' },
  { width: 'stretch' },
  { blockSize: 'max-content' },
  { position: 'sticky' },
  { position: 'sticky !important' },
  { display: 'flex' },
  { display: 'inline-flex' },
  { display: 'flex !important' },
  { display: 'grid' },
  { display: 'inline-grid' },
  { writingMode: 'vertical-lr' },
  { writingMode: 'vertical-rl' },
  { writingMode: 'horizontal-tb' },
  { writingMode: 'sideways-rl' },
  { scrollMargin: 4 },
  { scrollMarginTop: 4 },
  { color: 'red' },
  { '&::placeholder': { color: 'gray' } },
  { '&:read-only': { color: 'gray' } },
  { '&:read-write': { color: 'blue' } },
  { '@keyframes spin': { from: { opacity: 0 }, to: { opacity: 1 } }, animation: 'spin 1s' },
  { '@media (min-width: 600px)': { display: 'grid', '&:hover': { userSelect: 'none' } } },
  { '@supports (display: grid)': { display: 'grid' } },
  { '& > span': { flex: 1 }, label: 'named' },
]

/** The rules a cache writes for `css`, with the given plugins or Emotion's default ones. */
function rules(css: Record<string, unknown>, stylisPlugins?: unknown[]): string {
  const cache = createCache({ key: 'k', ...(stylisPlugins ? { stylisPlugins: stylisPlugins as never } : {}) })
  cache.compat = true
  const serialized = serializeStyles([css as never])
  cache.insert(`.k-${serialized.name}`, serialized, cache.sheet, true)
  return cache.inserted[serialized.name] as string
}

describe('the copy of Emotion’s vendor prefixer', () => {
  it.each(CORPUS.map(css => [JSON.stringify(css), css] as const))('writes what Emotion’s default plugins write for %s', (_, css) => {
    expect(rules(css, [prefixer])).toBe(rules(css))
  })

  it('is not stylis’s own prefixer, which writes other rules', () => {
    const differing = CORPUS.filter(css => rules(css, [stylisPrefixer]) !== rules(css))

    expect(differing.length).toBeGreaterThan(0)
  })
})
