// @vitest-environment jsdom
//
// What `StyledRenderer` reads of its props in the browser. The props a walk
// hands it for compiled styles (a named style, a run of named styles before or
// after its own, a scope, a class-only carrier) only exist once compiled output
// has registered a style, which installs the named runtime. Without it, every
// one of those reads is a lookup that misses on every styled node, so an app
// built without the compiler must not make them.
import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, describe, expect, it } from 'vitest'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { STATIC_CLASS_ONLY_PROP, STATIC_RUN_AFTER_PROP, STATIC_RUN_PROP, STATIC_SCOPE_PROP, STATIC_STYLE_PROP } from '@src/constant/common.const.js'
import { namedRuntime } from '@src/util/named-runtime-slot.util.js'
import { installNamedRuntime } from '@src/util/named-runtime.util.js'

/** The props only compiled output gives a styled node. */
const STATIC_PROPS = [STATIC_CLASS_ONLY_PROP, STATIC_RUN_PROP, STATIC_RUN_AFTER_PROP, STATIC_SCOPE_PROP, STATIC_STYLE_PROP]

const installedBefore = namedRuntime.current
afterEach(() => {
  namedRuntime.current = installedBefore
})

/** Renders one styled element in the browser and returns the keys `StyledRenderer` read of its props, and the element. */
function readsOf(props: Record<string, unknown>): { reads: Set<string>; html: string } {
  const reads = new Set<string>()
  const watched = new Proxy(props, {
    get(target, key, receiver) {
      if (typeof key === 'string') reads.add(key)
      return Reflect.get(target, key, receiver)
    },
  })
  // Called as a function inside a component, so its hooks run in that component and it reads the watched object itself.
  function Probe(): ReactElement {
    return StyledRenderer(watched as never) as ReactElement
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(createElement(Probe)))
  const html = host.innerHTML
  flushSync(() => root.unmount())
  host.remove()
  return { reads, html }
}

const PROPS = { element: 'span', css: { padding: '1px', color: 'rgb(1, 2, 3)' }, className: 'given', 'data-x': '1', children: 'x' }

describe('StyledRenderer in the browser', () => {
  it('reads no compiled-style prop when no compiled style is registered', () => {
    namedRuntime.current = undefined
    const { reads, html } = readsOf({ ...PROPS })
    expect(html).toMatch(/^<span class="given css-[a-z0-9]+" data-x="1">x<\/span>$/)
    expect(STATIC_PROPS.filter(key => reads.has(key))).toEqual([])
  })

  // The instrument: with the runtime installed, the same render reads them, so the check above can fail.
  it('reads them once a compiled style is registered', () => {
    installNamedRuntime()
    const { reads } = readsOf({ ...PROPS })
    expect(STATIC_PROPS.filter(key => reads.has(key)).length).toBeGreaterThan(0)
  })

  it('renders the same element either way', () => {
    namedRuntime.current = undefined
    const without = readsOf({ ...PROPS }).html
    installNamedRuntime()
    expect(readsOf({ ...PROPS }).html).toBe(without)
  })
})
