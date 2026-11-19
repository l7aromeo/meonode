// Shared by the `passthrough-*.client.test.ts` files: compiles a source through
// the real plugin, renders its default export in React development, and returns
// React's missing-key reports.
//
// React reports a missing key once per parent it reconciled the list under,
// then never again in the process. One report spent by an earlier case would
// silence a later one, so every scenario lives in a test file of its own, which
// vitest runs in a fresh module graph with its own React.
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import createEmotionCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { transform } from '@swc/core'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { vi } from 'vitest'

const WASM_PATH = path.resolve(import.meta.dirname, '../npm/meonode_swc_plugin.wasm')
const TMP_DIR = path.resolve(import.meta.dirname, '.tmp')

if (!existsSync(WASM_PATH)) {
  throw new Error(`wasm artifact not found at ${WASM_PATH} — run \`bun run build:wasm\` first`)
}

/** React's development report for a list rendered without keys. */
const MISSING_KEY = /Each child in a list should have a unique "key" prop/

/** The two wrappers from issue #113, each handing on the children its caller wrote. */
export const WRAPPERS = `
import { Div, Node, Span } from '@meonode/ui'

// A helper that passes its children through.
export const Card = ({ children }: { children: unknown[] }) => Div({ padding: 4, children })

// A component that does the same with its props.
export function CardComponent({ children }: { children?: unknown }) {
  return Div({ padding: 4, children: children as any }).render()
}
`

export interface Compiled {
  code: string
  module: { default: () => { render(): ReactNode } }
}

/** Compiles `src` with the plugin at its default options, as an app gets it, and imports the result. */
export async function compileAndImport(src: string, name: string): Promise<Compiled> {
  const result = await transform(src, {
    filename: `${name}.ts`,
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript', tsx: false },
      experimental: { plugins: [[WASM_PATH, {}]] },
    },
  })
  await mkdir(TMP_DIR, { recursive: true })
  const file = path.join(TMP_DIR, `${name}.mjs`)
  await writeFile(file, result.code, 'utf8')
  return { code: result.code, module: (await import(pathToFileURL(file).href)) as Compiled['module'] }
}

/** Renders `node` in a fresh root and returns every missing-key report React logged. */
export async function keyReportsOf(node: { render(): ReactNode }): Promise<string[]> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(createElement(CacheProvider, { value: createEmotionCache({ key: 'css' }) }, node.render()))
    })
    return errors.mock.calls.map(args => args.map(String).join(' ')).filter(line => MISSING_KEY.test(line))
  } finally {
    act(() => root.unmount())
    container.remove()
    errors.mockRestore()
  }
}
