#!/usr/bin/env bun
/**
 * Writes a CommonJS declaration file (`.d.cts`) beside every `.d.ts` in a
 * package's types directory, for the `require` condition of its exports.
 *
 * The packages are `"type": "module"`, so TypeScript reads every `.d.ts` in
 * them as an ES module. A CommonJS consumer whose `require` resolves to
 * `dist/cjs/*.cjs` would otherwise be typed against ES module declarations:
 * under `node16`/`nodenext` resolution TypeScript then treats the import as
 * ESM-from-CJS, which is not what runs. A `.d.cts` is CommonJS by extension.
 *
 * Each copy differs from its `.d.ts` only in its relative specifiers: `./x.js`
 * becomes `./x.cjs`, so it resolves to the sibling `x.d.cts` and the whole
 * graph stays CommonJS. Package specifiers are left alone; they resolve
 * through their own package's `require` condition. Declaration maps are copied
 * alongside with their `file` field renamed, so go-to-definition still reaches
 * the source.
 *
 * Usage:
 *   bun ../../scripts/emit-cjs-declarations.ts <types-dir>
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** A relative module specifier ending in `.js`, in `from '…'`, `import('…')` or `import '…'`. */
const RELATIVE_JS_SPECIFIER = /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"]))(\.{1,2}\/[^'"]*?)\.js\2/g

/** The trailing map comment tsc writes into each declaration file. */
const MAP_COMMENT = /\/\/# sourceMappingURL=(.+)\.d\.ts\.map\s*$/

/**
 * Converts one `.d.ts` file's text to its `.d.cts` form.
 * @param text The `.d.ts` content.
 * @returns The content with relative `.js` specifiers pointing at `.cjs`, and the map comment at the `.d.cts.map`.
 */
export const toCjsDeclaration = (text: string): string =>
  text.replace(RELATIVE_JS_SPECIFIER, (_, prefix: string, quote: string, base: string) => `${prefix}${base}.cjs${quote}`).replace(MAP_COMMENT, '//# sourceMappingURL=$1.d.cts.map\n')

/**
 * Converts one declaration map to the map of the `.d.cts` it now belongs to.
 * @param text The `.d.ts.map` content.
 * @returns The map with its `file` field naming the `.d.cts`.
 */
export const toCjsDeclarationMap = (text: string): string => {
  const map = JSON.parse(text) as { file?: string }
  if (map.file) map.file = map.file.replace(/\.d\.ts$/, '.d.cts')
  return JSON.stringify(map)
}

/**
 * Writes the `.d.cts` (and `.d.cts.map`) beside each `.d.ts` under `dir`.
 * @param dir The types directory.
 * @returns How many declaration files were written.
 */
export const emitCjsDeclarations = (dir: string): number => {
  let count = 0
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    if (entry.name.endsWith('.d.ts')) {
      writeFileSync(file.replace(/\.d\.ts$/, '.d.cts'), toCjsDeclaration(readFileSync(file, 'utf8')))
      count++
    } else if (entry.name.endsWith('.d.ts.map')) {
      writeFileSync(file.replace(/\.d\.ts\.map$/, '.d.cts.map'), toCjsDeclarationMap(readFileSync(file, 'utf8')))
    }
  }
  return count
}

if (import.meta.main) {
  const dir = process.argv[2]
  if (!dir) throw new Error('usage: emit-cjs-declarations.ts <types-dir>')
  console.log(`emit-cjs-declarations: ${emitCjsDeclarations(path.resolve(dir))} .d.cts files in ${dir}`)
}
