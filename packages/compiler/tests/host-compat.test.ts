// Host compatibility: does a plugin build load and run in a given @swc/core?
//
// A swc Wasm plugin receives the whole program from its host, serialized in the
// host's AST schema, and decodes it with its own. When the two come from
// different swc generations the decode fails on the first node whose shape
// changed, and the host raises "Failed to deserialize program received from
// host" and stops the build. swc_ecma_ast 29 (@swc/core 1.16) changed every
// function body, so a source with no function in it loads fine across that
// boundary. Every source here therefore puts call sites inside each function
// shape.
//
// Runs against this package's own @swc/core and freshly built plugin by
// default. CI points it at other hosts and other plugin builds:
//   MEONODE_SWC_HOST     a directory whose node_modules holds the @swc/core to load
//   MEONODE_PLUGIN_WASM  the plugin .wasm to load

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type SwcCore = typeof import('@swc/core')

const hostDir = process.env.MEONODE_SWC_HOST ? path.resolve(process.env.MEONODE_SWC_HOST) : import.meta.dirname
const hostRequire = createRequire(path.join(hostDir, 'package.json'))
const swc = hostRequire('@swc/core') as SwcCore
const hostVersion = (hostRequire('@swc/core/package.json') as { version: string }).version

const wasmPath = path.resolve(process.env.MEONODE_PLUGIN_WASM || path.join(import.meta.dirname, '../npm/meonode_swc_plugin.wasm'))
if (!existsSync(wasmPath)) {
  throw new Error(`plugin not found at ${wasmPath}: run \`bun run build:wasm\` first, or set MEONODE_PLUGIN_WASM`)
}

/** One `Div` call site in each place a program can hold one. */
const SHAPES: Record<string, string> = {
  'top level': 'Div({ padding: 1 })',
  'function declaration': 'function f() { return Div({ padding: 1 }) }',
  'function expression': 'const f = function () { return Div({ padding: 1 }) }',
  'block-bodied arrow': 'const f = () => { return Div({ padding: 1 }) }',
  'expression-bodied arrow': 'const f = () => Div({ padding: 1 })',
  'class method': 'class C { m() { return Div({ padding: 1 }) } }',
  'object method': 'const o = { m() { return Div({ padding: 1 }) } }',
}

function compile(body: string): string {
  return swc.transformSync(`import { Div } from '@meonode/ui'\n${body}\n`, {
    filename: 'host-compat.tsx',
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript', tsx: true },
      experimental: { plugins: [[wasmPath, {}]] },
    },
  }).code
}

describe(`plugin ${path.basename(path.dirname(wasmPath))}/${path.basename(wasmPath)} in @swc/core ${hostVersion}`, () => {
  it.each(Object.entries(SHAPES))('marks a call site at %s', (_, body) => {
    expect(compile(body)).toMatch(/__meo\$:\s*\d/)
  })

  it('compiles a function with no call sites without marking it', () => {
    expect(compile('function f(a: number) { return a + 1 }')).not.toContain('__meo$')
  })
})
