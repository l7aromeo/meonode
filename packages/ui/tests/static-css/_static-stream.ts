// Streams a page with a late Suspense boundary through React's server renderer:
// prints { shell, completion } for `fragment` or `document` (argv[2]).
import { createElement, Suspense, use, type ReactNode } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { Writable } from 'node:stream'
import { Div } from '@src/main.js'
import { registerStaticCss } from '@src/util/static-css.util.js'

export const SHELL = 'mn-00000000shell'
export const LATE = 'mn-000000000late'
export const register = () =>
  registerStaticCss('stream', [
    [1, SHELL, `.${SHELL}{padding:1px;}`],
    [1, LATE, `.${LATE}{padding:2px;}`],
  ])

export function Late({ data }: { data: Promise<string> }): ReactNode {
  const text = use(data)
  return Div({ children: [Div({ key: 'late', __meo$: 2, __meo$s: LATE, id: 'late', children: text } as never)] }).render()
}

export function Page({ data, mode }: { data: Promise<string>; mode: string }): ReactNode {
  const body = Div({
    children: [
      mode.endsWith('bare') ? Div({ key: 'shell', id: 'shell', children: 'shell' }) : Div({ key: 'shell', __meo$: 2, __meo$s: SHELL, id: 'shell', children: 'shell' } as never),
      Div({ key: 'shell-rt', css: { margin: 1 }, children: 'rt' }),
      createElement(Suspense, { key: 's', fallback: createElement('p', { id: 'fallback' }, 'loading') }, createElement(Late, { data })),
    ],
  }).render()
  return mode.startsWith('document') ? createElement('html', null, createElement('head', null), createElement('body', null, body)) : body
}

if (import.meta.main) {
  register()
  const mode = process.argv[2]
  let resolve!: (v: string) => void
  const data = new Promise<string>(r => (resolve = r))
  let written = ''
  let shell = ''
  const sink = new Writable({
    write(chunk, _, cb) {
      written += chunk
      cb()
    },
    final(cb) {
      process.stdout.write(JSON.stringify({ shell, completion: written.slice(shell.length) }))
      cb()
    },
  })
  const { pipe } = renderToPipeableStream(createElement(Page, { data, mode }), {
    onShellReady() {
      pipe(sink)
      setTimeout(() => {
        shell = written
        resolve('late')
      }, 50)
    },
  })
}
