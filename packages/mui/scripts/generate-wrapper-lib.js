import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import React, { isValidElement } from 'react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const LIB_DIR = path.join(SRC_DIR, 'lib')
const require = createRequire(import.meta.url)
const WRAPPED_CACHE_PATH = path.join(ROOT, '.cache', 'wrapped-mui.json')

const MODULE_CONFIGS = [
  { key: 'mui.core', importPath: '@mui/material' },
  { key: 'mui.lab', importPath: '@mui/lab', source: 'entry' },
  { key: 'mui.x-date-pickers', importPath: '@mui/x-date-pickers' },
  { key: 'mui.x-date-pickers-pro', importPath: '@mui/x-date-pickers-pro' },
  {
    key: 'mui.x-data-grid',
    importPath: '@mui/x-data-grid',
    includeEntryExports: true,
    additionalImportPaths: ['@mui/x-data-grid/components'],
  },
  {
    key: 'mui.x-data-grid-pro',
    importPath: '@mui/x-data-grid-pro',
    includeEntryExports: true,
    additionalImportPaths: ['@mui/x-data-grid-pro/components'],
  },
  {
    key: 'mui.x-data-grid-premium',
    importPath: '@mui/x-data-grid-premium',
    includeEntryExports: true,
    additionalImportPaths: ['@mui/x-data-grid-premium/components'],
  },
  { key: 'mui.x-charts', importPath: '@mui/x-charts' },
  { key: 'mui.x-charts-pro', importPath: '@mui/x-charts-pro' },
  { key: 'mui.x-tree-view', importPath: '@mui/x-tree-view' },
  { key: 'mui.x-tree-view-pro', importPath: '@mui/x-tree-view-pro' },
]

function keepExport(name, config) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return false
  if (name.endsWith('Classes') || name.endsWith('ClassKey')) return false
  if (name.endsWith('Error')) return false
  if (name.endsWith('Cache') || name.endsWith('CacheDefault')) return false
  if (name.endsWith('Context') || name.endsWith('Root')) return false
  if (config.exclude?.has(name)) return false
  return !config.excludePrefix?.some(prefix => name.startsWith(prefix))
}

function isRuntimeReactComponent(value) {
  const t = typeof value
  if (t !== 'function' && t !== 'object') return false
  if (value == null) return false

  if (t === 'object') {
    const tag = value.$$typeof
    const allowed = new Set([Symbol.for('react.memo'), Symbol.for('react.forward_ref'), Symbol.for('react.lazy')])
    if (!allowed.has(tag)) return false
  }

  try {
    const element = React.createElement(value)
    if (!isValidElement(element)) return false
  } catch {
    return false
  }

  if (typeof value === 'function') {
    if (value.length > 2) return false
    const proto = value.prototype
    const hasReactRender = !!proto && (proto.isReactComponent || typeof proto.render === 'function')
    const isLikelyClass = !!proto && Object.getOwnPropertyNames(proto).length > 1
    if (isLikelyClass && !hasReactRender) return false
  }
  return true
}

function getPackageEntryFile(importPath) {
  const packageJsonPath = require.resolve(`${importPath}/package.json`)
  const packageDir = path.dirname(packageJsonPath)
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const relEntry = packageJson.module ?? packageJson.main ?? 'index.js'
  return path.resolve(packageDir, relEntry)
}

function getImportEntryFile(importPath) {
  try {
    return getPackageEntryFile(importPath)
  } catch {
    return require.resolve(importPath)
  }
}

function collectExportedNamesFromEntry(importPath) {
  const entryPath = getImportEntryFile(importPath)
  return Array.from(collectExportedNamesFromFile(entryPath, new Set()))
}

function tryLoadRuntimeExports(importPath) {
  try {
    return require(importPath)
  } catch {
    return null
  }
}

function resolveRequiredFile(fromFile, requestPath) {
  const base = path.resolve(path.dirname(fromFile), requestPath)
  const candidates = [base, `${base}.js`, `${base}.cjs`, path.join(base, 'index.js')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function collectExportedNamesFromFile(filePath, visited) {
  const realPath = path.resolve(filePath)
  if (visited.has(realPath)) return new Set()
  visited.add(realPath)

  const source = fs.readFileSync(realPath, 'utf8')
  const names = new Set()

  const directExportPattern = /Object\.defineProperty\(exports,\s*"([A-Za-z0-9_]+)"/g
  let match = directExportPattern.exec(source)
  while (match) {
    names.add(match[1])
    match = directExportPattern.exec(source)
  }

  const requireMap = new Map()
  const requirePattern = /var\s+(_[A-Za-z0-9_]+)\s*=\s*require\("([^"]+)"\);/g
  match = requirePattern.exec(source)
  while (match) {
    requireMap.set(match[1], match[2])
    match = requirePattern.exec(source)
  }

  const exportNamesBlockMatch = /var _exportNames = \{([\s\S]*?)};/.exec(source)
  if (exportNamesBlockMatch) {
    const block = exportNamesBlockMatch[1]
    const keyPattern = /^\s*([A-Za-z0-9_]+):\s*true,?$/gm
    let keyMatch = keyPattern.exec(block)
    while (keyMatch) {
      names.add(keyMatch[1])
      keyMatch = keyPattern.exec(block)
    }
  }

  const objectKeysPattern = /Object\.keys\((_[A-Za-z0-9_]+)\)\.forEach\(function \(key\) \{[\s\S]*?}\);/g
  match = objectKeysPattern.exec(source)
  while (match) {
    const varName = match[1]
    const requestPath = requireMap.get(varName)
    if (requestPath?.startsWith('.')) {
      const targetFile = resolveRequiredFile(realPath, requestPath)
      if (targetFile) {
        const nested = collectExportedNamesFromFile(targetFile, visited)
        for (const name of nested) names.add(name)
      }
    }
    match = objectKeysPattern.exec(source)
  }

  const defaultAsPattern = /export\s*\{\s*default\s+as\s+([A-Za-z0-9_]+)\s*}\s*from/g
  match = defaultAsPattern.exec(source)
  while (match) {
    names.add(match[1])
    match = defaultAsPattern.exec(source)
  }

  const namedPattern = /export\s*\{\s*([^}]+)}\s*from/g
  match = namedPattern.exec(source)
  while (match) {
    const parts = match[1].split(',').map(token => token.trim())
    for (const part of parts) {
      if (!part) continue
      const aliasMatch = /\bas\s+([A-Za-z0-9_]+)$/.exec(part)
      names.add(aliasMatch ? aliasMatch[1] : part)
    }
    match = namedPattern.exec(source)
  }

  return names
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/')
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function buildComponentFileContent(componentName, importPath, useWrapped) {
  const coreImport = useWrapped ? "import { createMuiNode, type WrappedMui } from '@src/core.js'" : "import { createMuiNode } from '@src/core.js'"
  const typedDecl = useWrapped
    ? `const ${componentName}: WrappedMui<typeof Mui${componentName}> = createMuiNode(Mui${componentName})`
    : `const ${componentName} = createMuiNode(Mui${componentName})`

  return `${coreImport}
import { ${componentName} as Mui${componentName} } from '${importPath}'

${typedDecl}
export default ${componentName}
`
}

function moduleOutputDir(moduleKey) {
  return path.join(LIB_DIR, moduleKey)
}

function legacyFlatFilePath(moduleKey) {
  return path.join(LIB_DIR, `${moduleKey}.ts`)
}

function renderModuleFiles(config, importEntries, wrappedMuiSet) {
  const outDir = moduleOutputDir(config.key)
  fs.rmSync(outDir, { recursive: true, force: true })
  ensureDir(outDir)

  const allComponents = []
  for (const entry of importEntries) {
    for (const name of entry.componentNames) {
      allComponents.push({ name, importPath: entry.importPath })
    }
  }

  for (const comp of allComponents) {
    const useWrapped = wrappedMuiSet.has(comp.name)
    const content = buildComponentFileContent(comp.name, comp.importPath, useWrapped)
    fs.writeFileSync(path.join(outDir, `${comp.name}.ts`), content)
  }

  const indexContent = allComponents.map(comp => `export { default as ${comp.name} } from './${comp.name}.js'`).join('\n')
  fs.writeFileSync(path.join(outDir, 'index.ts'), `${indexContent}\n`)

  const legacyPath = legacyFlatFilePath(config.key)
  if (fs.existsSync(legacyPath)) {
    fs.rmSync(legacyPath, { force: true })
  }
}

function generateModule(config, autoWrappedMap = {}) {
  const allImportPaths = [config.importPath, ...(config.additionalImportPaths ?? [])]
  const importEntries = allImportPaths.map(importPath => {
    const runtimeExports = tryLoadRuntimeExports(importPath)
    const candidateNames = runtimeExports ? Object.keys(runtimeExports) : collectExportedNamesFromEntry(importPath)
    return {
      importPath,
      runtimeExports,
      componentNames: candidateNames.filter(name => keepExport(name, config)),
    }
  })

  for (const entry of importEntries) {
    const runtimeExports = entry.runtimeExports
    if (!runtimeExports) continue
    entry.componentNames = entry.componentNames.filter(name => name in runtimeExports && isRuntimeReactComponent(runtimeExports[name]))
  }

  const seen = new Set()
  for (const entry of importEntries) {
    entry.componentNames = entry.componentNames
      .sort((a, b) => a.localeCompare(b))
      .filter(name => {
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
  }

  const cacheKey = toPosix(path.relative(ROOT, moduleOutputDir(config.key)))
  const autoWrapped = new Set(autoWrappedMap[cacheKey] ?? [])
  const wrappedMuiSet = new Set([...(config.wrappedMui ?? new Set()), ...autoWrapped])
  renderModuleFiles(config, importEntries, wrappedMuiSet)
  console.log(`Generated ${cacheKey} (${seen.size} exports)`)
}

function generateMainSource() {
  const mainPath = path.join(SRC_DIR, 'main.ts')
  const content = `export * from '@src/core.js'
export * from '@src/lib/mui.core/index.js'
`
  fs.writeFileSync(mainPath, content)
}

function generateAllModules(autoWrappedMap = {}) {
  for (const config of MODULE_CONFIGS) {
    generateModule(config, autoWrappedMap)
  }
  generateMainSource()
}

function loadWrappedCache() {
  try {
    if (!fs.existsSync(WRAPPED_CACHE_PATH)) return {}
    return JSON.parse(fs.readFileSync(WRAPPED_CACHE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveWrappedCache(cache) {
  ensureDir(path.dirname(WRAPPED_CACHE_PATH))
  fs.writeFileSync(WRAPPED_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)
}

function runTypeCheckAndCollectWrappedCandidates() {
  const tscBin = require.resolve('typescript/bin/tsc')
  const result = spawnSync(process.execPath, [tscBin, '--noEmit', '--pretty', 'false'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (result.status === 0) return {}

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const out = {}
  for (const line of output.split('\n')) {
    if (!line.includes('TS4023') && !line.includes('TS2883')) continue

    const fileMatch = line.match(/(src\/lib\/mui\.[^/]+)\/[^(:]+\.ts\(\d+,\d+\): error TS(?:4023|2883):/)
    if (!fileMatch) continue
    const dirKey = fileMatch[1]

    const symbolMatch = line.match(/'([A-Za-z0-9_]+)'/)
    if (!symbolMatch) continue
    const exportName = symbolMatch[1]

    if (!out[dirKey]) out[dirKey] = new Set()
    out[dirKey].add(exportName)
  }

  return Object.fromEntries(Object.entries(out).map(([dir, names]) => [dir, Array.from(names).sort((a, b) => a.localeCompare(b))]))
}

function mergeWrappedMaps(baseMap, discoveredMap) {
  const merged = {}
  const keys = new Set([...Object.keys(baseMap), ...Object.keys(discoveredMap)])
  for (const key of keys) {
    const values = new Set([...(baseMap[key] ?? []), ...(discoveredMap[key] ?? [])])
    merged[key] = Array.from(values).sort((a, b) => a.localeCompare(b))
  }
  return merged
}

function main() {
  const wrappedCache = loadWrappedCache()
  generateAllModules(wrappedCache)

  const discovered = runTypeCheckAndCollectWrappedCandidates()
  const merged = mergeWrappedMaps(wrappedCache, discovered)
  if (JSON.stringify(merged) !== JSON.stringify(wrappedCache)) {
    saveWrappedCache(merged)
    generateAllModules(merged)
  }
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exitCode = 1
}
