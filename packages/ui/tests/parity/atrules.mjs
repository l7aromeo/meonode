// The at-rule inventory: every at-rule @webref/css lists, each with the css
// key and value a case writes it as, the element it styles, any declarations
// the node needs beside it for the at-rule to show (a font family that uses a
// @font-face, an animation that uses a @keyframes), and the stylesheet text
// that tells whether the engine under test parses it. The generated cases
// render each entry at three depths: at the top of a node's css, inside a
// selector block, and inside another at-rule. The gate fails when webref lists
// an at-rule this file does not.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PACKAGE } from './build.mjs'

/** The declarations a conditional at-rule sets on its node, as css object source. */
const DECL = `{ color: 'rgb(200, 0, 0)', outlineOffset: '3px' }`
/** The same declarations as stylesheet text, for parse probes. */
const PROBE_DECL = '{color:red}'

/** A conditional or grouping at-rule written in a node's css around declarations. */
const group = (name, key, extra = {}) => ({ name, key, value: DECL, probe: `.parity-x{${key}${PROBE_DECL}}`, ...extra })
/** A top-level at-rule with descriptors, written in a node's css as an object of them. */
const block = (name, key, value, probe, extra = {}) => ({ name, key, value, probe, ...extra })
/** A statement at-rule, written in a node's css as a string value. */
const statement = (name, value, probe) => ({ name, key: name, value: JSON.stringify(value), probe })
/** A rule that only lives inside another, written inside its parent. */
const inside = (name, parent, parentProbe, body, probeBody) => ({
  name,
  key: parent,
  value: `{ ${JSON.stringify(name)}: ${body} }`,
  probe: `${parentProbe}{${name}${probeBody}}`,
})

/** The @page margin boxes, each with a content descriptor inside @page. */
const MARGIN_BOXES = [
  '@top-left-corner',
  '@top-left',
  '@top-center',
  '@top-right',
  '@top-right-corner',
  '@bottom-left-corner',
  '@bottom-left',
  '@bottom-center',
  '@bottom-right',
  '@bottom-right-corner',
  '@left-top',
  '@left-middle',
  '@left-bottom',
  '@right-top',
  '@right-middle',
  '@right-bottom',
]
/** The @font-feature-values feature blocks, each naming one feature value. */
const FEATURE_BLOCKS = ['@swash', '@stylistic', '@styleset', '@character-variant', '@ornaments', '@annotation', '@historical-forms']

/**
 * Every inventory entry: `name` is webref's, `id` (the name unless a second
 * form of one at-rule needs its own) is what a case lists in `meta.atrules`.
 */
export const ATRULES = [
  group('@media', '@media (min-width: 1px)'),
  group('@supports', '@supports (display: grid)'),
  group('@container', '@container (min-width: 1px)', { container: true }),
  group('@layer', '@layer parity'),
  { ...statement('@layer', 'parity-a, parity-b', '@layer parity-a, parity-b;'), id: '@layer statement' },
  group('@scope', '@scope (.parity-scope)', { scope: true }),
  group('@starting-style', '@starting-style'),
  group('@when', '@when media(min-width: 1px)'),
  group('@else', '@else'),
  group('@navigation', '@navigation (at: url("/"))'),
  group('@location', '@location url("/")'),
  group('@private', '@private'),
  block('@supports-condition', '@supports-condition --parity', `{ display: 'grid' }`, '@supports-condition --parity{(display:grid)}'),
  statement('@custom-media', '--parity (min-width: 1px)', '@custom-media --parity (min-width: 1px);'),
  statement('@custom-selector', ':--parity .parity-x', '@custom-selector :--parity .parity-x;'),
  statement('@import', 'url("data:text/css,")', '@import url("data:text/css,");'),
  statement('@charset', '"utf-8"', '@charset "utf-8";'),
  statement('@namespace', 'parity url(http://www.w3.org/2000/svg)', '@namespace parity url(http://www.w3.org/2000/svg);'),
  statement('@apply', '--parity', '.parity-x{@apply --parity;}'),
  statement('@contents', '', '@mixin --parity(){@contents;}'),
  block(
    '@font-face',
    '@font-face',
    `{ fontFamily: 'parity-font', src: 'local("Arial")', sizeAdjust: '150%' }`,
    '@font-face{font-family:parity-font;src:local("Arial");size-adjust:150%}',
    { extra: `fontFamily: 'parity-font', display: 'inline-block'` },
  ),
  block(
    '@property',
    '@property --parity-angle',
    `{ syntax: '"<angle>"', inherits: 'false', initialValue: '45deg' }`,
    '@property --parity-angle{syntax:"<angle>";inherits:false;initial-value:45deg}',
    { extra: `rotate: 'var(--parity-angle)'` },
  ),
  block(
    '@keyframes',
    '@keyframes parity-fade',
    `{ from: { color: 'rgb(0, 0, 0)' }, to: { color: 'rgb(200, 0, 0)' } }`,
    '@keyframes parity-fade{from{color:black}to{color:red}}',
    { extra: `animation: 'parity-fade 10s linear -5s paused'` },
  ),
  block(
    '@-webkit-keyframes',
    '@-webkit-keyframes parity-wk',
    `{ from: { color: 'rgb(0, 0, 0)' }, to: { color: 'rgb(0, 200, 0)' } }`,
    '@-webkit-keyframes parity-wk{from{color:black}to{color:green}}',
    { extra: `animation: 'parity-wk 10s linear -5s paused'` },
  ),
  block(
    '@counter-style',
    '@counter-style parity-count',
    `{ system: 'cyclic', symbols: '"*"', suffix: '" "' }`,
    '@counter-style parity-count{system:cyclic;symbols:"*";suffix:" "}',
    { on: 'list', extra: `listStyleType: 'parity-count'` },
  ),
  block(
    '@font-palette-values',
    '@font-palette-values --parity',
    `{ fontFamily: 'Arial', basePalette: '0' }`,
    '@font-palette-values --parity{font-family:Arial;base-palette:0}',
    { extra: `fontPalette: '--parity'` },
  ),
  block('@font-feature-values', '@font-feature-values Arial', `{ '@swash': { parity: '1' } }`, '@font-feature-values Arial{@swash{parity:1}}', {
    extra: `fontFamily: 'Arial', fontVariantAlternates: 'swash(parity)'`,
  }),
  ...FEATURE_BLOCKS.map(name => inside(name, '@font-feature-values Arial', '@font-feature-values Arial', `{ parity: '1' }`, '{parity:1}')),
  block('@position-try', '@position-try --parity', `{ top: 'anchor(bottom)' }`, '@position-try --parity{top:anchor(bottom)}', {
    extra: `positionTryFallbacks: '--parity'`,
  }),
  block('@view-transition', '@view-transition', `{ navigation: 'auto' }`, '@view-transition{navigation:auto}'),
  block('@color-profile', '@color-profile --parity', `{ src: 'url("data:,")' }`, '@color-profile --parity{src:url("data:,")}'),
  block('@page', '@page', `{ margin: '1cm' }`, '@page{margin:1cm}'),
  ...MARGIN_BOXES.map(name => inside(name, '@page', '@page', `{ content: '"parity"' }`, '{content:"parity"}')),
  block('@function', '@function --parity()', `{ result: '3px' }`, '@function --parity(){result:3px}', { extra: `outlineOffset: '--parity()'` }),
  block('@mixin', '@mixin --parity()', DECL, `@mixin --parity()${PROBE_DECL}`),
]

for (const entry of ATRULES) entry.id ??= entry.name

/** Webref's at-rule names. */
export async function webrefAtrules() {
  const require = createRequire(join(PACKAGE, 'package.json'))
  const webref = await import(require.resolve('@webref/css'))
  return (await webref.default.listAll()).atrules.map(a => a.name)
}

/** Webref at-rules with no inventory entry. */
export async function atruleGaps() {
  const listed = new Set(ATRULES.map(a => a.name))
  return (await webrefAtrules()).filter(name => !listed.has(name))
}

/**
 * Runs in the page: whether the engine parses each probe, judged by the
 * at-rule's name surviving in the serialised rules of a stylesheet holding it.
 * @param probes `[name, stylesheet text]` pairs.
 */
export function parsesAtrules(probes) {
  const serialise = rules => [...rules].map(r => r.cssText + (r.cssRules ? serialise(r.cssRules) : '')).join('\n')
  return probes.map(([name, text]) => {
    const style = document.createElement('style')
    style.textContent = text
    document.head.append(style)
    const parsed = serialise(style.sheet?.cssRules ?? []).includes(name)
    style.remove()
    return parsed
  })
}
