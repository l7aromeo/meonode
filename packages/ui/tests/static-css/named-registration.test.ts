// @vitest-environment node
//
// What compiled modules register: each module's named styles once, by its id,
// and each template's chunks. A name or a template registered again with other
// text means the output of two builds is loaded together, which development
// reports by throwing; production keeps the first text.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetThemeDiagnostics } from '@src/util/theme-diagnostics.util.js'
import { __resetStaticCss, hasNamedStyles, registerStaticCss, registerStaticTemplate, staticStylesOf, templateText } from '@src/util/static-css.util.js'

afterEach(() => {
  vi.unstubAllEnvs()
  // The development switch is read once; this seam reads it again.
  __resetThemeDiagnostics()
  __resetStaticCss()
})

/** Runs `run` with `NODE_ENV` set to `mode`. */
function inMode(mode: 'development' | 'production', run: () => void) {
  vi.stubEnv('NODE_ENV', mode)
  __resetThemeDiagnostics()
  run()
}

describe('a module’s named styles', () => {
  it('are recorded by name, and nothing is registered before any module', () => {
    __resetStaticCss()
    expect(hasNamedStyles()).toBe(false)
    registerStaticCss('m-1', [['a1', 'color:red;']])
    expect(hasNamedStyles()).toBe(true)
    expect(staticStylesOf('a1')).toBe('color:red;')
    expect(staticStylesOf('unknown')).toBeUndefined()
  })

  it('register once per module id, so a module run again adds nothing', () => {
    __resetStaticCss()
    registerStaticCss('m-1', [['a1', 'color:red;']])
    registerStaticCss('m-1', [['a2', 'color:blue;']])
    expect(staticStylesOf('a2')).toBeUndefined()
  })

  it('share a name another module registered with the same text', () => {
    __resetStaticCss()
    registerStaticCss('m-1', [['a1', 'color:red;']])
    expect(() => registerStaticCss('m-2', [['a1', 'color:red;']])).not.toThrow()
    expect(staticStylesOf('a1')).toBe('color:red;')
  })

  it('throw in development for a name another module registered with other text', () => {
    inMode('development', () => {
      __resetStaticCss()
      registerStaticCss('m-1', [['a1', 'color:red;']])
      expect(() => registerStaticCss('m-2', [['a1', 'color:blue;']])).toThrow(
        '[MeoNode] The static style `a1` is registered with two different texts:\n  color:red;\n  color:blue;\nOutput of two different builds is loaded together.',
      )
    })
  })

  it('keep the first text in production', () => {
    inMode('production', () => {
      __resetStaticCss()
      registerStaticCss('m-1', [['a1', 'color:red;']])
      expect(() => registerStaticCss('m-2', [['a1', 'color:blue;']])).not.toThrow()
      expect(staticStylesOf('a1')).toBe('color:red;')
    })
  })
})

describe('a template', () => {
  it('fills its holes with value texts, in order', () => {
    __resetStaticCss()
    registerStaticTemplate('t-1', ['width:', ';height:', ';'])
    expect(hasNamedStyles()).toBe(true)
    expect(templateText('t-1', ['4px', '5px'])).toBe('width:4px;height:5px;')
  })

  it('fills nothing for an unknown id, a wrong number of values, or a value that is not text', () => {
    __resetStaticCss()
    registerStaticTemplate('t-1', ['width:', ';'])
    expect(templateText('t-2', ['4px'])).toBeUndefined()
    expect(templateText('t-1', [])).toBeUndefined()
    expect(templateText('t-1', ['4px', '5px'])).toBeUndefined()
    expect(templateText('t-1', [undefined])).toBeUndefined()
  })

  it('registered again with the same chunks keeps them, and with others throws in development', () => {
    inMode('development', () => {
      __resetStaticCss()
      registerStaticTemplate('t-1', ['width:', ';'])
      expect(() => registerStaticTemplate('t-1', ['width:', ';'])).not.toThrow()
      expect(() => registerStaticTemplate('t-1', ['height:', ';'])).toThrow('[MeoNode] The static template `t-1` is registered with two different texts')
    })
  })

  it('registered again with other chunks keeps the first in production', () => {
    inMode('production', () => {
      __resetStaticCss()
      registerStaticTemplate('t-1', ['width:', ';'])
      expect(() => registerStaticTemplate('t-1', ['height:', ';'])).not.toThrow()
      expect(templateText('t-1', ['4px'])).toBe('width:4px;')
    })
  })
})
