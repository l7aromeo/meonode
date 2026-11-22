// @vitest-environment node
//
// The class a styled host node gets in a server component must be the one it
// gets in a client component, for every call site the compiler can name: the
// compiler emits one name, and each layer prefixes its own cache key. The
// serialization differential (`packages/compiler/tests/serialization-differential.test.ts`)
// proves the compiled name equals the client's for the same corpus, so equal
// client and server names make the compiled name the server's too.
//
// The client side is a server render of the client graph, read from the
// classes Emotion gives. The server side loads the runtime as the React Server
// Components layer loads it (see `react-server-layer.test.ts`) and reads the
// classes the elements carry.
import { readFileSync, globSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CORPUS_CONSTS, corpusCalls, PROPS } from '../../compiler/tests/serialization-corpus'

const require = createRequire(import.meta.url)
const REACT_SERVER_ENTRY = path.join(path.dirname(require.resolve('react/package.json')), 'react.react-server.js')
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const CLIENT_MODULES = globSync('**/*.ts', { cwd: SRC })
  .filter(file => readFileSync(path.join(SRC, file), 'utf8').startsWith("'use client'"))
  .map(file => `@src/${file.replace(/\.ts$/, '.js')}`)

/** Attribute naming the case on its node. */
const CASE_ATTRIBUTE = 'data-case'
/** The client's Emotion cache key, and the server layer's. */
const CLIENT_KEY = 'css'
const SERVER_KEY = 'meonode-css'

type Factories = Record<'Div' | 'Row' | 'Column' | 'Center' | 'Grid', (props: unknown) => { render(): ReactNode }>
type CaseFn = (factories: Factories, p: unknown) => { render(): ReactNode }

const calls = corpusCalls()
/** Each call as a function of the factories and the run-time props. */
const caseFns: CaseFn[] = calls.map((c, i) => {
  const body = c.call.replace('ATTR_PAIR', `${JSON.stringify(CASE_ATTRIBUTE)}: "${i}-pair"`).replace('ATTR', `${JSON.stringify(CASE_ATTRIBUTE)}: "${i}"`)
  const consts = Object.entries(CORPUS_CONSTS).map(([name, value]) => `const ${name} = ${value};`).join('')
  const fn = new Function('Div', 'Row', 'Column', 'Center', 'Grid', 'p', `${consts} return ${body}`)
  return (f, p) => fn(f.Div, f.Row, f.Column, f.Center, f.Grid, p)
})

const factoriesOf = (main: Record<string, unknown>) =>
  Object.fromEntries(['Div', 'Row', 'Column', 'Center', 'Grid'].map(name => [name, main[name]])) as Factories

/** `case id` → the node's own name, from classes carrying `key`. */
type Names = Map<string, string>

function ownName(className: unknown, key: string): string | undefined {
  if (typeof className !== 'string') return undefined
  const own = className.split(/\s+/).filter(c => c.startsWith(`${key}-`))
  return own.length === 1 ? own[0].slice(key.length + 1) : undefined
}

/**
 * Cases the two layers name differently today, by the case name, with why.
 * Each is checked to differ still, so a change to either layer shows here.
 */
const KNOWN_DIFFERENCES: { pattern: RegExp; reason: string }[] = [
  {
    // On the runtime path, extraction or not.
    pattern: /^spelling .*"@(media|supports|container) [^"]*theme\./,
    reason: 'a theme token in an at-rule key: with no theme in scope the server names the class after the whole css and leaves the key to ThemedRule',
  },
  {
    // Named by the compiler, as the client names it.
    pattern: /^(var |const )?token with a brace$/,
    reason: "a value holding a token and a brace: the client reads it as CSS text and drops the token's block, the server keeps it",
  },
]

/** Names per run-time props index, then case index. */
let client: Names[][]
let server: Names[][]

beforeAll(async () => {
  // The client graph: a server render under a CacheProvider, as an SSR pass gives it.
  const exportsOf = new Map<string, string[]>()
  for (const specifier of CLIENT_MODULES) exportsOf.set(specifier, Object.keys(await import(specifier)))
  const clientMain = (await import('@src/main.js')) as unknown as Record<string, unknown>
  const { renderToString } = await import('react-dom/server')
  const createCache = (await import('@emotion/cache')).default
  const { CacheProvider } = await import('@emotion/react')
  const clientFactories = factoriesOf(clientMain)
  client = PROPS.map(p =>
    caseFns.map(fn => {
      const html = renderToString(createElement(CacheProvider, { value: createCache({ key: CLIENT_KEY }) }, fn(clientFactories, p).render()))
      const names: Names = new Map()
      for (const tag of html.matchAll(/<[a-z]+\s[^>]*>/g)) {
        const id = tag[0].match(new RegExp(`${CASE_ATTRIBUTE}="([^"]*)"`))?.[1]
        const name = ownName(tag[0].match(/\sclass="([^"]*)"/)?.[1], CLIENT_KEY)
        if (id !== undefined && name !== undefined) names.set(id, name)
      }
      return names
    }),
  )

  // The server layer: `react` through its react-server build, client modules as references.
  vi.resetModules()
  vi.doMock('react', () => {
    const reactServer = require(REACT_SERVER_ENTRY)
    return { ...reactServer, default: reactServer }
  })
  for (const [specifier, names] of exportsOf) {
    vi.doMock(specifier, () =>
      Object.fromEntries(
        names.map(name => [
          name,
          Object.assign(
            function ClientReference() {
              throw new Error(`client reference ${specifier}#${name} was called on the server`)
            },
            { $$typeof: Symbol.for('react.client.reference') },
          ),
        ]),
      ),
    )
  }
  const serverFactories = factoriesOf((await import('@src/main.js')) as unknown as Record<string, unknown>)
  const elements = (node: unknown): ReactElement<Record<string, unknown>>[] =>
    Array.isArray(node)
      ? node.flatMap(elements)
      : isValidElement(node)
        ? [node as ReactElement<Record<string, unknown>>, ...elements((node.props as { children?: unknown }).children)]
        : []
  server = PROPS.map(p =>
    caseFns.map(fn => {
      const names: Names = new Map()
      for (const element of elements(fn(serverFactories, p).render())) {
        const id = element.props[CASE_ATTRIBUTE]
        const name = ownName(element.props.className, SERVER_KEY)
        if (typeof id === 'string' && name !== undefined) names.set(id, name)
      }
      return names
    }),
  )
})

afterAll(() => {
  vi.doUnmock('react')
  for (const specifier of CLIENT_MODULES) vi.doUnmock(specifier)
  vi.resetModules()
})

describe('server and client components name a styled node alike', () => {
  it('for every call site of the serialization corpus', () => {
    const mismatches: string[] = []
    const known = new Set<string>()
    let compared = 0
    PROPS.forEach((_, pi) => {
      calls.forEach((c, ci) => {
        const want = client[pi][ci]
        const got = server[pi][ci]
        const knownDifference = KNOWN_DIFFERENCES.some(k => k.pattern.test(c.name))
        for (const id of new Set([...want.keys(), ...got.keys()])) {
          compared++
          const differs = want.get(id) !== got.get(id)
          if (differs && knownDifference) known.add(c.name)
          else if (differs) mismatches.push(`${c.name} [${id}] props ${pi}: client ${want.get(id) ?? '(none)'}, server ${got.get(id) ?? '(none)'}`)
        }
      })
    })
    // A run that compares nothing passes on any runtime.
    expect(compared).toBeGreaterThan(calls.length)
    expect(mismatches.slice(0, 30)).toEqual([])
    // Every known difference is still one, in every case it names.
    const named = calls.filter(c => KNOWN_DIFFERENCES.some(k => k.pattern.test(c.name))).map(c => c.name)
    expect([...known].sort()).toEqual([...new Set(named)].sort())
  })
})
