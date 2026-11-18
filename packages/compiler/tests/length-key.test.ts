// Whether a theme token takes its `--len` variant is decided by the property
// key it is written against, by `@meonode/ui` at runtime and by this plugin at
// build time. The two must decide alike for every way a key can be written, or
// a compiled call site renders a different declaration than the same call left
// to the runtime.
//
// Each key is rendered twice, from the same source transformed with and without
// the plugin, and the HTML must be identical. Each also states which answer is
// right, so two sides that agree on the wrong one still fail.
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import createEmotionCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { transform } from '@swc/core'
import { createElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

const WASM_PATH = path.resolve(import.meta.dirname, '../npm/meonode_swc_plugin.wasm')
const TMP_DIR = path.resolve(import.meta.dirname, '.tmp')

if (!existsSync(WASM_PATH)) {
  throw new Error(`wasm artifact not found at ${WASM_PATH} — run \`bun run build:wasm\` first`)
}

/** What a token written against a length property becomes. */
const LENGTH_REF = 'var(--meonode-theme-spacing-md--len, var(--meonode-theme-spacing-md))'
/** What it becomes against any other key. */
const PLAIN_REF = 'var(--meonode-theme-spacing-md)'

// [key, whether it names a length property]
const CORPUS: [string, boolean][] = [
  ['paddingTop', true],
  ['padding-top', true],
  ['margin', true],
  ['border-top-width', true],
  ['margin-inline-start', true],
  ['WebkitMarginStart', true],
  ['-webkit-margin-start', true],
  ['-webkit-mask-position', true],
  ['MozColumnWidth', true],
  ['-moz-column-width', true],
  ['msWrapMargin', true],
  ['MsWrapMargin', true],
  ['-ms-wrap-margin', true],
  ['--gap', false],
  ['--padding-top', false],
  ['lineHeight', false],
  ['line-height', false],
  ['zIndex', false],
  ['z-index', false],
  ['opacity', false],
  ['flex-grow', false],
  ['color', false],
  ['background-color', false],
  ['Padding-Top', false],
]

/**
 * `key` as written in source: a bare identifier when it is one, a string
 * otherwise. The plugin reads the two kinds of key on separate paths.
 */
const sourceKey = (key: string) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key))

/** A call site writing `key` against a numeric token, at the top of `css` and inside a nested block. */
const inCss = (key: string) => `
import { Div, ThemeProvider } from '@meonode/ui'
export default () =>
  ThemeProvider({
    tokens: { spacing: { md: 16 } },
    modes: ['light'],
    defaultMode: 'light',
    children: [
      Div({ css: { ${sourceKey(key)}: 'theme.spacing.md' }, children: 'top' }),
      Div({ css: { '&:hover': { ${sourceKey(key)}: 'theme.spacing.md' } }, children: 'nested' }),
    ],
  })
`

/**
 * A call site passing `key` as a prop: a style prop when `key` is a CSS property
 * in the form the props take, a DOM attribute otherwise. The runtime converts a
 * token in either against the key, and so does the plugin.
 */
const asProp = (key: string) => `
import { Div, ThemeProvider } from '@meonode/ui'
export default () =>
  ThemeProvider({
    tokens: { spacing: { md: 16 } },
    modes: ['light'],
    defaultMode: 'light',
    children: Div({ ${sourceKey(key)}: 'theme.spacing.md', children: 'prop' }),
  })
`

const compile = async (src: string, withPlugin: boolean) =>
  (
    await transform(src, {
      filename: 'length-key.ts',
      jsc: { target: 'es2022', parser: { syntax: 'typescript', tsx: false }, experimental: { plugins: withPlugin ? [[WASM_PATH, {}]] : [] } },
    })
  ).code

let moduleId = 0

/** Imports `code` from a file under `tests/.tmp/`, so `@meonode/ui` resolves through this repo, and renders its tree. */
const render = async (code: string) => {
  const file = path.join(TMP_DIR, `length-key.${moduleId++}.mjs`)
  await writeFile(file, code, 'utf8')
  const tree = ((await import(pathToFileURL(file).href)) as { default: () => { render(): ReactNode } }).default()
  return renderToString(createElement(CacheProvider, { value: createEmotionCache({ key: 'css' }) }, tree.render()))
}

beforeAll(async () => {
  await mkdir(TMP_DIR, { recursive: true })
})

/** Renders `src` transformed with and without the plugin, and checks the plugin rewrote the token itself. */
const renderBoth = async (src: string) => {
  const plain = await compile(src, false)
  const compiled = await compile(src, true)
  // The plugin rewrote the token, so the runtime did not decide for it.
  expect(plain).toContain('theme.spacing.md')
  expect(compiled).not.toContain('theme.spacing.md')
  return { plain: await render(plain), compiled: await render(compiled) }
}

describe.each(CORPUS)('a theme token under %j', (key, isLength) => {
  it(`in css renders the same compiled and not, ${isLength ? 'with' : 'without'} the length variant`, async () => {
    const { plain, compiled } = await renderBoth(inCss(key))
    expect(compiled).toBe(plain)
    // Every reference takes one form: Emotion may add a prefixed copy of the
    // declaration, but never one written against a different key.
    expect(plain.includes(LENGTH_REF)).toBe(isLength)
    expect(plain.replaceAll(LENGTH_REF, '').includes(PLAIN_REF)).toBe(!isLength)
  })

  // React drops an attribute whose name starts with `-`, and says so.
  it.skipIf(key.startsWith('-'))('as a prop renders the same compiled and not', async () => {
    const { plain, compiled } = await renderBoth(asProp(key))
    expect(compiled).toBe(plain)
  })
})
