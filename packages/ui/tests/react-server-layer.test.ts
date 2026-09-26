// @vitest-environment node
//
// The runtime loaded as the React Server Components layer loads it: `react`
// resolved through its `react-server` export condition, and every `'use client'`
// module replaced by client references, as a bundler does there. That build of
// React omits `Component` and the client hooks, so any path that reads one breaks
// only here.
import { readFileSync, globSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const REACT_SERVER_ENTRY = path.join(path.dirname(require.resolve('react/package.json')), 'react.react-server.js')
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

/** Every module that opens with the `'use client'` directive, as `@src/…js` specifiers. */
const CLIENT_MODULES = globSync('**/*.ts', { cwd: SRC })
  .filter(file => readFileSync(path.join(SRC, file), 'utf8').startsWith("'use client'"))
  .map(file => `@src/${file.replace(/\.ts$/, '.js')}`)

/** Stands in for a bundler's client reference: renderable as an element type, never called on the server. */
const clientReference = (name: string) =>
  Object.assign(
    function ClientReference() {
      throw new Error(`client reference ${name} was called on the server`)
    },
    { $$typeof: Symbol.for('react.client.reference') },
  )

type Main = typeof import('@src/main.js')
type NodeUtilModule = typeof import('@src/util/node.util.js')
let main: Main
let nodeUtil: NodeUtilModule['NodeUtil']

beforeAll(async () => {
  // Export names come from the client graph, which loads these modules for real.
  const exportsOf = new Map<string, string[]>()
  for (const specifier of CLIENT_MODULES) exportsOf.set(specifier, Object.keys(await import(specifier)))

  vi.resetModules()
  // A CommonJS module's default import is its `module.exports`, as a bundler interops it.
  vi.doMock('react', () => {
    const reactServer = require(REACT_SERVER_ENTRY)
    return { ...reactServer, default: reactServer }
  })
  for (const [specifier, names] of exportsOf) {
    vi.doMock(specifier, () => Object.fromEntries(names.map(name => [name, clientReference(`${specifier}#${name}`)])))
  }
  main = await import('@src/main.js')
  nodeUtil = (await import('@src/util/node.util.js')).NodeUtil
})

afterAll(() => {
  vi.doUnmock('react')
  for (const specifier of CLIENT_MODULES) vi.doUnmock(specifier)
  vi.resetModules()
})

describe('the runtime in the React Server Components layer', () => {
  it('loads against the react-server build, which has no Component', () => {
    expect('Component' in require(REACT_SERVER_ENTRY)).toBe(false)
    expect(CLIENT_MODULES.length).toBeGreaterThan(0)
  })

  it('hands a Promise child to React', () => {
    const child = Promise.resolve(1)
    const element = main.Div({ children: child }).render() as ReactElement<{ children: unknown }>
    expect(isValidElement(element)).toBe(true)
    expect(element.props.children).toBe(child)
  })

  it('hands a child it does not recognise to React', () => {
    const child = { unknown: true }
    const element = main.Div({ children: child as never }).render() as ReactElement<{ children: unknown }>
    expect(element.props.children).toBe(child)
  })

  it('returns what a render-prop child returns', () => {
    const result = Promise.resolve(1)
    expect(nodeUtil.functionRenderer({ render: () => result } as never)).toBe(result)
  })

  it('passes each item of a render-prop child’s array through', () => {
    const result = Promise.resolve(1)
    expect(nodeUtil.functionRenderer({ render: () => [result] } as never)).toEqual([result])
  })

  // A function in a host element's props cannot be serialized to the client, so the
  // render prop must reach React already wrapped in a server-side renderer.
  it('hands a render prop given as the only child of a host element to React as an element', () => {
    const element = main.Div({ children: () => 'from a render prop' }).render() as ReactElement<{ children: unknown }>
    expect(typeof element.props.children).not.toBe('function')
    expect(isValidElement(element.props.children)).toBe(true)
    expect((element.props.children as ReactElement).type).toBe(nodeUtil.functionRenderer)
  })
})
