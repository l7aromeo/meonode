// @vitest-environment node
//
// MeoNode's copy of Emotion's `serializeStyles` against the installed
// `@emotion/serialize`, in its production and its development build: the same
// text, label suffix, keyframes list and `toString`, the same errors logged and
// the same errors thrown, for every argument shape Emotion reads.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SerializedStyles } from '@emotion/serialize'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { refreshDevMode } from '@src/constant/common.const.js'
import { serializeUnnamed } from '@src/util/serialize-styles.util.js'

type Serialize = (args: readonly unknown[], registered?: Record<string, string> | null, mergedProps?: unknown) => SerializedStyles

/** The directory of the installed package's builds; its `exports` hide them by subpath. */
const dist = dirname(createRequire(import.meta.url).resolve('@emotion/serialize'))
const load = async (file: string): Promise<Serialize> => (await import(pathToFileURL(join(dist, file)).href)).serializeStyles
const emotion = { production: await load('emotion-serialize.esm.js'), development: await load('emotion-serialize.development.esm.js') }

afterAll(() => {
  vi.unstubAllEnvs()
  refreshDevMode()
})

/**
 * The README comparison app's css (`bench/browser-comparison.app.mjs`): node
 * `i` at version `v`, a unique colour, a theme token on every fifth node, a
 * display on every fourth, a hover rule on every sixth and a media query on
 * every seventh.
 */
function appCss(i: number, v: number): Record<string, unknown> {
  const tone = i % 10 < 3 ? v : 0
  const css: Record<string, unknown> = {
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

/** The app's nodes on its first mount, and the nodes its first update changes. */
const APP_NODES = 10_081
const UPDATED_NODES = 3_024

const keyframes = {
  anim: 1,
  name: 'animation-x1',
  styles: '@keyframes animation-x1{from{opacity:0}to{opacity:1}}',
  toString: () => '_EMO_animation-x1_@keyframes animation-x1{from{opacity:0}to{opacity:1}}_EMO_',
}
const serialized = emotion.production([{ color: 'red', label: 'pre' }])
const chained = emotion.production([{ animationName: keyframes, label: 'chain' }])
const template = (strings: TemplateStringsArray, ...values: unknown[]) => [strings, ...values]
const componentSelector = { __emotion_styles: [], toString: () => '.component-selector' }

/** Every argument shape `serializeStyles` reads, each run without and with a registered map and props. */
const SHAPES: Array<[string, unknown[]]> = [
  ['object', [{ color: 'red' }]],
  ['label', [{ color: 'red', label: 'card' }]],
  ['labels across arguments', [{ label: 'a' }, { label: 'b', padding: 1 }]],
  ['string with a label', ['color:red;label:x;']],
  ['label at the end without a semicolon', ['color:red;label:end']],
  [
    'numbers: px, unitless, custom property, zero',
    [
      {
        zIndex: 2,
        opacity: 0.5,
        flex: 1,
        width: 10,
        height: 0,
        lineHeight: 1.5,
        '--gap': 4,
        WebkitLineClamp: 2,
        msTransform: 'none',
        MozBoxSizing: 'border-box',
      },
    ],
  ],
  ['nested selectors and at-rules', [{ '&:hover': { color: 'red', '& > span': { margin: 2 } }, '@media (min-width: 1px)': { padding: [1, 2] } }]],
  ['fallback arrays', [{ margin: ['1px', '2px'], display: ['flex', '-webkit-box'] }]],
  ['values that write nothing', [{ color: null, padding: undefined, margin: false, border: true }]],
  ['keyframes in an animation string', [{ animation: `${keyframes} 1s` }]],
  ['keyframes object as animationName', [{ animationName: keyframes }]],
  ['keyframes alone', [keyframes]],
  ['array under a selector', [{ '&': [{ color: 'red' }, { padding: 2 }] }]],
  ['a lone serialized argument', [serialized]],
  ['a serialized argument among others', [serialized, { padding: 1 }]],
  ['a serialized argument carrying keyframes', [chained, { margin: 0 }]],
  ['nested array with strings, null and false', [[{ color: 'red' }, 'padding:2px;', null, false]]],
  ['quoted content', [{ content: '"x"' }]],
  ['content keyword', [{ content: 'none' }]],
  ['content function', [{ content: 'attr(x)' }]],
  ['unquoted content', [{ content: 'x' }]],
  ['registered class as a value', [{ color: 'css-reg1' }]],
  ['registered class as a string', ['css-reg1']],
  ['registered class under a selector', [{ '.x': 'abc' }]],
  ['function argument', [(props: { tone: string }) => ({ color: props.tone })]],
  ['function value', [{ color: (props: { tone: string }) => props.tone }]],
  ['function returning a function', [(props: { tone: string }) => (inner: { tone: string }) => ({ color: props.tone + inner.tone })]],
  ['template literal', template`color:${'red'};padding:${2}px;label:tpl;`],
  ['template with an object', template`${{ color: 'red' }}margin:0;`],
  ['template with keyframes', template`animation:${keyframes} 2s;`],
  ['template with an illegal escape first', template`content:'\xg7';color:${'red'};`],
  ['template with an illegal escape later', template`color:${'red'};content:'\unicode';`],
  ['undefined key', [{ [String(undefined)]: { color: 'red' } }]],
  ['kebab-case property', [{ 'background-color': 'red' }]],
  ['keyframes text in a plain string', ['_EMO_animation-y_@keyframes animation-y{}_EMO_']],
  ['component selector as a value', [componentSelector]],
  ['component selector as a key', [{ NO_COMPONENT_SELECTOR: { color: 'red' } }]],
  ['empty', [{}]],
  ['no argument', []],
  ['null', [null]],
]

const REGISTERED = { 'css-reg1': 'color:blue;', abc: 'margin:0;' }
const PROPS = { tone: 'green' }

/** What a call shows: its result as the caller reads it, or the error it threw, and what it logged. */
function observe(serialize: Serialize, args: readonly unknown[], registered?: Record<string, string> | null, props?: unknown) {
  const logged: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => void logged.push(parts.map(String).join(' ')))
  try {
    const result = serialize(args, registered, props)
    const dash = result.name.indexOf('-')
    return {
      label: dash === -1 ? '' : result.name.slice(dash),
      styles: result.styles,
      next: JSON.stringify(result.next ?? null),
      toString: Object.hasOwn(result, 'toString') ? String(result) : '',
      logged,
    }
  } catch (error) {
    return { threw: (error as Error).message, logged }
  } finally {
    spy.mockRestore()
  }
}

describe.each(['production', 'development'] as const)('serializeUnnamed in %s', mode => {
  const setMode = () => {
    vi.stubEnv('NODE_ENV', mode)
    refreshDevMode()
  }

  it('writes what Emotion writes for every node of the README app, mount and update', () => {
    setMode()
    const differ: number[] = []
    for (let version = 0; version < 2; version++) {
      for (let i = 0; i < (version === 0 ? APP_NODES : UPDATED_NODES); i++) {
        const args = [appCss(i, version)]
        if (JSON.stringify(observe(serializeUnnamed, args)) !== JSON.stringify(observe(emotion[mode], args))) differ.push(i)
      }
    }
    expect(differ).toEqual([])
  })

  it.each(SHAPES)('writes, logs and throws what Emotion does: %s', (_shape, args) => {
    setMode()
    for (const [registered, props] of [
      [undefined, undefined],
      [REGISTERED, PROPS],
      [null, PROPS],
    ] as const) {
      expect(observe(serializeUnnamed, args, registered, props)).toEqual(observe(emotion[mode], args, registered, props))
    }
  })

  it('names nothing: the name is only the label suffix', () => {
    setMode()
    expect(serializeUnnamed([{ color: 'red' }]).name).toBe('')
    expect(serializeUnnamed([{ color: 'red', label: 'a' }, { label: 'b' }]).name).toBe('-a-b')
  })

  it('returns a lone serialized argument itself, as Emotion does', () => {
    setMode()
    expect(serializeUnnamed([serialized])).toBe(serialized)
  })
})
