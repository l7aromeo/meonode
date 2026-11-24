// @vitest-environment jsdom
//
// Compiled output registers an empty style list in a module that loads the
// runtime but has no style of its own, so that a bundler places what renders
// compiled styles with the outermost such module. That registration installs
// all of it: the named runtime, the compiled-style resolution and the resolver
// of themed conditions. The element a server component hands a client
// reference installs the named runtime, the registry with it, and the
// compiled-style resolution, which resolves themed conditions on its own. Each
// case loads the modules afresh, with nothing installed.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())

async function slots() {
  const { namedRuntime, compiledStyles } = await import('@src/util/named-runtime-slot.util.js')
  const { themedTexts } = await import('@src/util/themed-text-slot.util.js')
  return () => ({ named: namedRuntime.current !== undefined, compiled: compiledStyles.resolve !== undefined, themed: themedTexts.resolver !== undefined })
}

describe('what installs the runtime of compiled styles', () => {
  it('an empty registration installs all of it, and no walk starts before a style is registered', async () => {
    const installed = await slots()
    expect(installed()).toEqual({ named: false, compiled: false, themed: false })
    const { registerStaticCss } = await import('@src/util/static-css.util.js')
    const { namedRuntime } = await import('@src/util/named-runtime-slot.util.js')
    registerStaticCss('3gng7kheu33tg', [])
    expect(installed()).toEqual({ named: true, compiled: true, themed: true })
    expect(namedRuntime.current!.walk()).toBeUndefined()
    registerStaticCss('one', [['meonode-css-one', 'color:red;']])
    expect(namedRuntime.current!.walk()).toBeDefined()
  })

  it('rendering the element a server component hands a client reference installs all of it', async () => {
    const installed = await slots()
    const { default: CompiledStyledRenderer } = await import('@src/components/compiled-styled-renderer.client.js')
    expect(installed()).toEqual({ named: false, compiled: false, themed: false })
    renderToString(createElement(CompiledStyledRenderer, { element: 'div' } as never))
    expect(installed()).toEqual({ named: true, compiled: true, themed: false })
  })
})
