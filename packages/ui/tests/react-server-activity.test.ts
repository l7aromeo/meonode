// @vitest-environment node
//
// `Activity` in the React Server Components layer, against both shapes of React's
// `react-server` build: 19.3's, which exports `Activity`, and 19.2's, which does not
// (every 19.2.x release, though their client builds export it). The runtime has to
// load against both and build the same `<Activity>` element, because `@meonode/ui`
// supports React from 19.2.0.
import { readFileSync, globSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const REACT_SERVER_ENTRY = path.join(path.dirname(require.resolve('react/package.json')), 'react.react-server.js')
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

/** The element type React gives `<Activity>` in every build that exports it. */
const ACTIVITY_TYPE = Symbol.for('react.activity')

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

/**
 * The runtime loaded as the React Server Components layer loads it, against the
 * installed `react-server` build with `omit` taken out of it.
 */
async function loadServerLayer(omit: string[]): Promise<Main> {
  const exportsOf = new Map<string, string[]>()
  for (const specifier of CLIENT_MODULES) exportsOf.set(specifier, Object.keys(await import(specifier)))

  vi.resetModules()
  vi.doMock('react', () => {
    const reactServer = { ...require(REACT_SERVER_ENTRY) }
    for (const name of omit) delete reactServer[name]
    return { ...reactServer, default: reactServer }
  })
  for (const [specifier, names] of exportsOf) {
    vi.doMock(specifier, () => Object.fromEntries(names.map(name => [name, clientReference(`${specifier}#${name}`)])))
  }
  return import('@src/main.js')
}

afterEach(() => {
  vi.doUnmock('react')
  for (const specifier of CLIENT_MODULES) vi.doUnmock(specifier)
  vi.resetModules()
})

describe('Activity in the React Server Components layer', () => {
  it.each([
    ['React 19.3, which exports Activity from it', []],
    ['React 19.2, which does not', ['Activity']],
  ])('builds an <Activity> element against the react-server build of %s', async (_, omit) => {
    const main = await loadServerLayer(omit)
    const element = main.Activity({ mode: 'hidden', children: main.Div({ children: 'kept' }) }).render() as ReactElement<{
      mode: string
      children: unknown
    }>
    expect(isValidElement(element)).toBe(true)
    expect(element.type).toBe(ACTIVITY_TYPE)
    expect(element.props.mode).toBe('hidden')
    expect(isValidElement(element.props.children)).toBe(true)
  })

  // The stand-in is only right while it equals what React exports wherever it does.
  it('stands in with the same value the installed React exports as Activity', () => {
    expect(require('react').Activity).toBe(ACTIVITY_TYPE)
    const reactServer = require(REACT_SERVER_ENTRY)
    if ('Activity' in reactServer) expect(reactServer.Activity).toBe(ACTIVITY_TYPE)
  })
})
