// The published types name types from the wrapped @mui packages, and they are compiled
// against this package's devDependencies, which track the latest releases. A user may
// install the oldest release each peer range allows. If a type the declarations name is
// missing there, the user's type check fails with "has no exported member" (or, under
// skipLibCheck, the prop silently becomes `any`). This checks every such name against
// the peer floors installed in tests/peer-floor.
//
// Needs `bun run build` first, for dist/types. `bun run test:peer-floor` installs
// tests/peer-floor and runs this file.
import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const PACKAGE_DIR = path.join(import.meta.dir, '..')
const TYPES_DIR = path.join(PACKAGE_DIR, 'dist/types')
const FLOOR_DIR = path.join(import.meta.dir, 'peer-floor')

/** The packages whose types the declarations may name, by the start of their specifier. */
const isMuiSpecifier = (specifier: string) => specifier.startsWith('@mui/')
/** The `@mui` package a specifier such as `@mui/material-nextjs/v16-appRouter` belongs to. */
const packageOf = (specifier: string) => specifier.split('/').slice(0, 2).join('/')

const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
  peerDependencies: Record<string, string>
}
const floor = JSON.parse(readFileSync(path.join(FLOOR_DIR, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

/** The lowest version a peer range allows; the ranges here are `^x.y.z` or exact. */
const lowestAllowed = (range: string) => {
  const match = /^\^?(\d+\.\d+\.\d+(?:-[\w.]+)?)$/.exec(range)
  if (!match) throw new Error(`Cannot read the lowest version of "${range}"; extend lowestAllowed`)
  return match[1]
}

function declarationFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return declarationFiles(full)
    return entry.name.endsWith('.d.ts') ? [full] : []
  })
}

/** Every name the declarations take from an `@mui` module, by module specifier. */
function referencedNames(): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>()
  const add = (specifier: string, name: string) => {
    if (!names.has(specifier)) names.set(specifier, new Set())
    names.get(specifier)!.add(name)
  }
  for (const file of declarationFiles(TYPES_DIR)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
    const visit = (node: ts.Node) => {
      // import("@mui/material").ChipOwnerState, possibly qualified further
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        const specifier = node.argument.literal.text
        if (isMuiSpecifier(specifier) && node.qualifier) {
          let first: ts.EntityName = node.qualifier
          while (ts.isQualifiedName(first)) first = first.left
          add(specifier, first.text)
        }
      }
      // import { Chip as MuiChip } from '@mui/material', and the same for re-exports
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text
        if (isMuiSpecifier(specifier)) {
          const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause
          if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
            for (const element of bindings.elements) add(specifier, (element.propertyName ?? element.name).text)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return names
}

/** What each module exports as the type checker sees it, resolved from the floor install. */
function floorExports(specifiers: string[]): Map<string, Set<string> | undefined> {
  const probe = path.join(FLOOR_DIR, '__probe__.ts')
  const probeText = specifiers.map((specifier, i) => `import * as m${i} from '${specifier}'\n`).join('')
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const { fileExists, readFile, getSourceFile } = host
  host.fileExists = file => file === probe || fileExists(file)
  host.readFile = file => (file === probe ? probeText : readFile(file))
  host.getSourceFile = (file, language, ...rest) => (file === probe ? ts.createSourceFile(file, probeText, language) : getSourceFile(file, language, ...rest))
  const program = ts.createProgram([probe], options, host)
  const checker = program.getTypeChecker()
  const exports = new Map<string, Set<string> | undefined>()
  for (const statement of program.getSourceFile(probe)!.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const symbol = checker.getSymbolAtLocation(statement.moduleSpecifier)
    exports.set(statement.moduleSpecifier.text, symbol && new Set(checker.getExportsOfModule(symbol).map(s => s.name)))
  }
  return exports
}

describe('@meonode/mui types on the oldest peers they allow', () => {
  it('install each @mui peer at the lowest version of its range', () => {
    const expected = Object.fromEntries(
      Object.entries(manifest.peerDependencies)
        .filter(([name]) => isMuiSpecifier(name))
        .map(([name, range]) => [name, lowestAllowed(range)]),
    )
    const installed = Object.fromEntries(Object.entries(floor.dependencies).filter(([name]) => isMuiSpecifier(name)))
    expect(installed).toEqual(expected)
  })

  it('only name types those versions export', () => {
    if (!existsSync(TYPES_DIR)) throw new Error(`${TYPES_DIR} is missing: run \`bun run build\` first`)
    if (!existsSync(path.join(FLOOR_DIR, 'node_modules'))) throw new Error(`${FLOOR_DIR} is not installed: run \`bun install\` there first`)

    const referenced = referencedNames()
    const exports = floorExports([...referenced.keys()])
    const missing: string[] = []
    for (const [specifier, names] of referenced) {
      const available = exports.get(specifier)
      if (!available) {
        missing.push(`${specifier}: module not found in ${floor.dependencies[packageOf(specifier)] ?? 'the floor install'}`)
        continue
      }
      for (const name of [...names].sort()) {
        if (!available.has(name)) missing.push(`${specifier} ${floor.dependencies[packageOf(specifier)]}: ${name}`)
      }
    }
    expect(referenced.size).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})
