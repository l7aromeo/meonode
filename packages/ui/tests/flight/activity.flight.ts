// @vitest-environment jsdom
//
// `Activity` from a server component, end to end: the built @meonode/ui renders it in
// a separate process loaded as the React Server Components layer (server.mjs), React's
// Flight client reads that payload here, and react-dom renders it. Showing, hiding and
// showing again must keep the client component's state, which is what Activity is for.
//
// The installed react, react-dom and react-server-dom-turbopack are used on both sides,
// so the same test checks every React version CI installs, the 19.2.0 floor included.
// Both entries are checked, the ES module one and the CommonJS one, since a server
// components runtime may load either. Needs `bun run build` first, for dist.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, globSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(HERE, '../../dist')
const SERVER = path.join(HERE, 'server.mjs')
const COUNTER = path.join(HERE, 'counter.client.mjs')

declare global {
  var __turbopack_require__: (id: string) => unknown
  var __turbopack_load_by_url__: (url: string) => Promise<void>
}

/** The package's entries a server components runtime may load, as built. */
const ENTRIES = {
  'ES module': path.join(DIST, 'esm/main.js'),
  CommonJS: path.join(DIST, 'cjs/main.cjs'),
}

/** The client modules the payload may reference, by file URL, loaded as the browser loads them. */
const clientModules = new Map<string, Record<string, unknown>>()

beforeAll(async () => {
  for (const entry of Object.values(ENTRIES)) {
    if (!existsSync(entry)) throw new Error(`${entry} is missing: run \`bun run build\` first`)
  }
  const files = [
    COUNTER,
    ...globSync('**/*.{js,cjs}', { cwd: DIST })
      .map(file => path.join(DIST, file))
      .filter(file => /^\s*["']use client["']/.test(readFileSync(file, 'utf8'))),
  ]
  for (const file of files) clientModules.set(pathToFileURL(file).href, await import(file))
  globalThis.__turbopack_require__ = id => clientModules.get(id)
  globalThis.__turbopack_load_by_url__ = () => Promise.resolve()
})

/**
 * Waits until `check` stops throwing. React's production builds have no `act`, so the
 * test waits for the DOM the way a user would, under every build.
 */
async function until(check: () => void, timeout = 5_000) {
  const start = Date.now()
  for (;;) {
    try {
      return check()
    } catch (error) {
      if (Date.now() - start > timeout) throw error
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
}

/** The Flight payload of the server tree with Activity in `mode`, read back into React elements. */
async function renderOnServer(entry: string, mode: 'visible' | 'hidden'): Promise<ReactNode> {
  const result = spawnSync(process.execPath, ['--conditions=react-server', SERVER, mode], {
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      FLIGHT_UI_ENTRY: pathToFileURL(entry).href,
      FLIGHT_COUNTER: pathToFileURL(COUNTER).href,
      FLIGHT_CLIENT_EXPORTS: JSON.stringify(Object.fromEntries([...clientModules].map(([url, mod]) => [url, Object.keys(mod)]))),
    },
  })
  if (result.status !== 0) throw new Error(`the server render failed:\n${result.stderr.toString()}`)
  // The package ships no type declarations.
  const { createFromReadableStream } = require('react-server-dom-turbopack/client.browser') as {
    createFromReadableStream: (stream: ReadableStream<Uint8Array>) => Promise<unknown>
  }
  const payload = result.stdout
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(payload))
      controller.close()
    },
  })
  return (await createFromReadableStream(stream)) as ReactNode
}

let root: Root | undefined
afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = ''
})

describe(`Activity rendered by a server component (React ${require('react/package.json').version})`, () => {
  it.each(Object.entries(ENTRIES))('from the %s entry, reaches the client as Activity: hidden hides its content and keeps its state', async (_, entry) => {
    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    const content = () => container.querySelector<HTMLElement>('[data-testid="activity-content"]')
    const button = () => container.querySelector('button')!

    root.render(await renderOnServer(entry, 'visible'))
    await until(() => expect(button().textContent).toBe('count 0'))
    for (let i = 1; i <= 3; i++) {
      button().click()
      await until(() => expect(button().textContent).toBe(`count ${i}`))
    }
    expect(content()!.style.display).toBe('')

    root.render(await renderOnServer(entry, 'hidden'))
    await until(() => expect(content()?.style.display).toBe('none'))
    expect(button().textContent).toBe('count 3')

    root.render(await renderOnServer(entry, 'visible'))
    await until(() => expect(content()?.style.display).toBe(''))
    expect(button().textContent).toBe('count 3')
  })
})
