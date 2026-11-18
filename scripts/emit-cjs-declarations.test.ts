// The CommonJS declarations written beside each `.d.ts` for the `require` condition.
import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { emitCjsDeclarations, toCjsDeclaration, toCjsDeclarationMap } from './emit-cjs-declarations'

describe('toCjsDeclaration', () => {
  it('points a relative `.js` specifier in `from` at `.cjs`', () => {
    expect(toCjsDeclaration("import type { A } from './a.js';\nexport { B } from '../b/c.js';")).toBe(
      "import type { A } from './a.cjs';\nexport { B } from '../b/c.cjs';",
    )
  })

  it('points a relative `.js` specifier in an import type at `.cjs`', () => {
    expect(toCjsDeclaration('x: import("../main.js").NodeElementType')).toBe('x: import("../main.cjs").NodeElementType')
  })

  it('points a side-effect import and `export *` at `.cjs`', () => {
    expect(toCjsDeclaration("import './side.js';\nexport * from \"./all.js\";")).toBe("import './side.cjs';\nexport * from \"./all.cjs\";")
  })

  it('leaves package specifiers alone', () => {
    const text = "import type { ReactNode } from 'react';\nimport { Div } from '@meonode/ui';\nimport type { T } from 'pkg/sub.js';"
    expect(toCjsDeclaration(text)).toBe(text)
  })

  it('points the map comment at the `.d.cts.map`', () => {
    expect(toCjsDeclaration('export {};\n//# sourceMappingURL=main.d.ts.map')).toBe('export {};\n//# sourceMappingURL=main.d.cts.map\n')
  })
})

describe('toCjsDeclarationMap', () => {
  it('names the `.d.cts` as the map file', () => {
    expect(JSON.parse(toCjsDeclarationMap('{"version":3,"file":"main.d.ts","sources":["../src/main.ts"],"mappings":""}'))).toEqual({
      version: 3,
      file: 'main.d.cts',
      sources: ['../src/main.ts'],
      mappings: '',
    })
  })
})

describe('emitCjsDeclarations', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes a `.d.cts` and `.d.cts.map` beside every declaration, nested ones included', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'cjs-decl-'))
    mkdirSync(path.join(dir, 'lib'))
    writeFileSync(path.join(dir, 'main.d.ts'), "export * from './lib/x.js';\n//# sourceMappingURL=main.d.ts.map")
    writeFileSync(path.join(dir, 'main.d.ts.map'), '{"file":"main.d.ts"}')
    writeFileSync(path.join(dir, 'lib/x.d.ts'), 'export declare const x: import("../main.js").Y;')
    expect(emitCjsDeclarations(dir)).toBe(2)
    expect(readFileSync(path.join(dir, 'main.d.cts'), 'utf8')).toBe("export * from './lib/x.cjs';\n//# sourceMappingURL=main.d.cts.map\n")
    expect(JSON.parse(readFileSync(path.join(dir, 'main.d.cts.map'), 'utf8'))).toEqual({ file: 'main.d.cts' })
    expect(readFileSync(path.join(dir, 'lib/x.d.cts'), 'utf8')).toBe('export declare const x: import("../main.cjs").Y;')
  })
})
