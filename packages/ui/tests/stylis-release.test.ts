// @vitest-environment node
//
// meonode's copy of Emotion's prefixer runs inside Emotion's stylis pipeline, on
// the helpers of the stylis meonode depends on. Both must be one release, which
// is also what lets a package manager install a single copy beside Emotion's
// exact pin.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface Manifest {
  dependencies: Record<string, string>
}

const ownRequire = createRequire(import.meta.url)
const emotionRequire = createRequire(ownRequire.resolve('@emotion/cache'))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Manifest
const emotionCache = ownRequire('@emotion/cache/package.json') as Manifest

describe('the stylis meonode depends on', () => {
  it('is the release @emotion/cache depends on', () => {
    expect(pkg.dependencies.stylis).toBe(emotionCache.dependencies.stylis)
  })

  it('is the installed copy Emotion loads', () => {
    expect(ownRequire.resolve('stylis')).toBe(emotionRequire.resolve('stylis'))
  })
})
