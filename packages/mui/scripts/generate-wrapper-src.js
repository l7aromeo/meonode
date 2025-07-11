/**
 * @file This script generates wrapper source files for Material-UI (MUI) components.
 * It reads from source files, processes them using Babel, and generates individual
 * component files in a `src-gen` directory. It also generates an `index.ts` file
 * for each module, re-exporting all components within that module.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as babel from '@babel/core'

/**
 * The current filename.
 * @type {string}
 * @private
 */
const __filename = fileURLToPath(import.meta.url)

/**
 * The directory name of the current file.
 * @type {string}
 * @private
 */
const __dirname = path.dirname(__filename)

/**
 * The root directory of the package.
 * @type {string}
 * @constant
 */
const PACKAGE_ROOT = path.resolve(__dirname, '..')

/**
 * The source directory containing original MUI component definitions.
 * @type {string}
 * @constant
 */
const SRC_DIR = path.join(PACKAGE_ROOT, 'src')

/**
 * The directory where generated source files will be placed.
 * @type {string}
 * @constant
 */
const SRC_GEN_DIR = path.join(PACKAGE_ROOT, 'src-gen')

/**
 * The path to the core utility source file (e.g., `createMuiNode`).
 * @type {string}
 * @constant
 */
const CORE_UTILITY_SRC_PATH = path.join(SRC_DIR, 'core.ts')

/**
 * The path to the main ts source file
 * @type {string}
 * @constant
 */
const MAIN_TS_SRC_PATH = path.join(SRC_DIR, 'main.ts')

/**
 * Defines the source files and output configurations for different MUI modules.
 * Each key represents a category of MUI components (e.g., 'mui.core', 'mui.lab').
 * @type {Object.<string, {srcFile: string, outputSubdir: string, muiPackage: string}>}
 * @constant
 */
const MODULE_SOURCES = {
  'mui.core': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.core.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.core'),
    muiPackage: '@mui/material',
  },
  'mui.lab': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.lab.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.lab'),
    muiPackage: '@mui/lab',
  },
  'mui.x-charts': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-charts.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-charts'),
    muiPackage: '@mui/x-charts',
  },
  'mui.x-charts-pro': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-charts-pro.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-charts-pro'),
    muiPackage: '@mui/x-charts-pro',
  },
  'mui.x-data-grid': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-data-grid.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-data-grid'),
    muiPackage: '@mui/x-data-grid',
  },
  'mui.x-data-grid-pro': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-data-grid-pro.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-data-grid-pro'),
    muiPackage: '@mui/x-data-grid-pro',
  },
  'mui.x-data-grid-premium': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-data-grid-premium.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-data-grid-premium'),
    muiPackage: '@mui/x-data-grid-premium',
  },
  'mui.x-date-pickers': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-date-pickers.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-date-pickers'),
    muiPackage: '@mui/x-date-pickers',
  },
  'mui.x-tree-view': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-tree-view.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-tree-view'),
    muiPackage: '@mui/x-tree-view',
  },
}

/**
 * Generates wrapper source files for MUI components.
 * This function performs the following steps:
 * 1. Cleans up the `src-gen` directory.
 * 2. Copies the core utility file to `src-gen`.
 * 3. Iterates through `MODULE_SOURCES` to process each MUI module.
 * - Reads the source file and parses it with Babel.
 * - Identifies component exports that use `createMuiNode`.
 * - Extracts necessary type information and imports.
 * - Generates a new wrapper file for each identified component in the `src-gen` subdirectory.
 * - Generates an `index.ts` file in each module's `src-gen` subdirectory that re-exports all generated components.
 * - Collects paths for generated components to update `temp-exports.json`.
 * @async
 * @returns {Promise<void>}
 */
async function generateWrapperSourceFiles() {
  // Clean up existing generated source directory
  if (fs.existsSync(SRC_GEN_DIR)) {
    fs.rmSync(SRC_GEN_DIR, { recursive: true, force: true })
  }
  // Create the generated source directory
  fs.mkdirSync(SRC_GEN_DIR, { recursive: true })

  // Copy the core utility file
  const coreUtilityGenPath = path.join(SRC_GEN_DIR, 'core.ts')
  fs.copyFileSync(CORE_UTILITY_SRC_PATH, coreUtilityGenPath)
  console.log(`Copied ${CORE_UTILITY_SRC_PATH} to ${coreUtilityGenPath}`)

  // Process each MUI module defined in MODULE_SOURCES
  for (const [categoryKey, config] of Object.entries(MODULE_SOURCES)) {
    console.log(`Processing ${config.srcFile} for ${categoryKey} components...`)
    fs.mkdirSync(config.outputSubdir, { recursive: true })

    const sourceCode = fs.readFileSync(config.srcFile, 'utf8')
    const ast = babel.parseSync(sourceCode, {
      filename: config.srcFile,
      sourceType: 'module',
      presets: [path.resolve(PACKAGE_ROOT, 'node_modules', '@babel/preset-typescript')],
    })

    /**
     * List of components to generate wrapper files for.
     * @type {Array<Object>}
     */
    const componentsToGenerate = []

    /**
     * A map to store the source path for each imported type.
     * @type {Map<string, string>}
     */
    const typeImportMap = new Map()

    // First pass: Collect all type imports and their original sources
    babel.traverse(ast, {
      /**
       * Visits an ImportDeclaration node to collect type import information.
       * @param {Object} path The Babel NodePath object.
       */
      ImportDeclaration(path) {
        const importPath = path.node.source.value
        path.node.specifiers.forEach(specifier => {
          if (
            (babel.types.isImportSpecifier(specifier) && specifier.imported.type === 'Identifier') ||
            (babel.types.isImportDefaultSpecifier(specifier) && specifier.local.type === 'Identifier') ||
            (babel.types.isImportNamespaceSpecifier(specifier) && specifier.local.type === 'Identifier')
          ) {
            const importedName = babel.types.isImportSpecifier(specifier) ? specifier.imported.name : specifier.local.name
            typeImportMap.set(importedName, importPath)
          }
        })
      },
    })

    // Second pass: Identify components created with `createMuiNode`
    babel.traverse(ast, {
      /**
       * Visits an ExportNamedDeclaration node to identify components for generation.
       * @param {Object} path The Babel NodePath object.
       */
      ExportNamedDeclaration(path) {
        if (path.node.declaration?.type === 'VariableDeclaration') {
          path.node.declaration.declarations.forEach(declarator => {
            if (
              declarator.type === 'VariableDeclarator' &&
              declarator.id.type === 'Identifier' &&
              declarator.init?.type === 'CallExpression' &&
              declarator.init.callee.type === 'Identifier' &&
              declarator.init.callee.name === 'createMuiNode'
            ) {
              const exportName = declarator.id.name
              const arg = declarator.init.arguments[0]
              if (arg?.type !== 'Identifier') return

              const muiAlias = arg.name
              const originalMuiComponentName = muiAlias.startsWith('Mui') ? muiAlias.slice(3) : muiAlias

              let typeAnnotation
              const typesToImport = new Set()

              const typeParams = declarator.init.typeParameters
              if (typeParams?.type === 'TSTypeParameterInstantiation' && typeParams.params.length > 0) {
                const typeNode = typeParams.params[0]
                // Extract the raw string of the type annotation
                typeAnnotation = sourceCode.slice(typeNode.start, typeNode.end)

                // Traverse the type annotation to find all referenced types
                babel.traverse(
                  typeNode,
                  {
                    /**
                     * Visits a TSTypeReference node to collect referenced types.
                     * @param {Object} innerPath The Babel NodePath object for the inner type reference.
                     */
                    TSTypeReference(innerPath) {
                      const typeName = innerPath.node.typeName
                      if (babel.types.isIdentifier(typeName)) {
                        const importedType = typeName.name
                        const importSource = typeImportMap.get(importedType) || config.muiPackage

                        typesToImport.add({ name: importedType, source: importSource })
                      }
                    },
                  },
                  path.scope,
                  path.parentPath,
                )
              }

              componentsToGenerate.push({
                exportName,
                muiAlias,
                originalMuiComponentName,
                muiPackage: config.muiPackage,
                srcGenOutputSubdir: config.outputSubdir,
                typeAnnotation,
                typesToImport: Array.from(typesToImport),
              })
            }
          })
        }
      },
    })

    // Generate individual wrapper files for each identified component
    for (const comp of componentsToGenerate) {
      const relativeCreateMuiNodePath = path.relative(comp.srcGenOutputSubdir, coreUtilityGenPath).replace(/\.ts$/, '')

      const needsReactImport = comp.typeAnnotation?.includes('React.') ?? false

      const importReactLine = needsReactImport ? `import React from 'react'` : ''
      const typeAnnotation = comp.typeAnnotation ? `<${comp.typeAnnotation}>` : ''

      /**
       * Groups imported types by their source module.
       * @type {Map<string, string[]>}
       */
      const groupedTypeImports = new Map()
      comp.typesToImport.forEach(typeDef => {
        if (!groupedTypeImports.has(typeDef.source)) {
          groupedTypeImports.set(typeDef.source, [])
        }
        groupedTypeImports.get(typeDef.source).push(typeDef.name)
      })

      const typeImportLines = Array.from(groupedTypeImports.entries())
        .map(([source, types]) => {
          let adjustedSource = source
          // Adjust relative paths for types imported from `@src/`
          if (source.startsWith('@src/')) {
            const relativePath = path.relative(config.outputSubdir, path.join(PACKAGE_ROOT, source.replace('@src/', 'src/')))
            adjustedSource = `./${relativePath.replace(/\.ts$/, '')}`
          }
          return `import type { ${Array.from(new Set(types)).join(', ')} } from '${adjustedSource}'`
        })
        .join('\n')

      const individualComponentCode = `
${importReactLine}
import { createMuiNode } from '${relativeCreateMuiNodePath}'
import { ${comp.originalMuiComponentName} as ${comp.muiAlias} } from '${comp.muiPackage}'
${typeImportLines}

const ${comp.exportName} = createMuiNode${typeAnnotation}(${comp.muiAlias})
export default ${comp.exportName}
`
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      const outputFilePath = path.join(comp.srcGenOutputSubdir, `${comp.exportName}.ts`)
      fs.writeFileSync(outputFilePath, individualComponentCode + '\n')
      console.log(`- Generated ${outputFilePath}`)
    }

    // Generate index.ts for the current module
    const indexExports = componentsToGenerate.map(comp => `export { default as ${comp.exportName} } from './${comp.exportName}'`).join('\n')

    if (indexExports) {
      const indexPath = path.join(config.outputSubdir, 'index.ts')
      fs.writeFileSync(indexPath, indexExports + '\n')
      console.log(`- Generated ${indexPath}`)
    }
  }

  console.log('Generated all intermediate source files in src-gen/!')
}

// Execute the generation function and catch any errors
generateWrapperSourceFiles()
  .then(() => {
    const mainTSContent = `
export * from './core'
export * from './lib/mui.core'
`.trim()

    // Generate the main.ts file
    const mainTSGenPath = path.join(SRC_GEN_DIR, 'main.ts')
    fs.writeFileSync(mainTSGenPath, mainTSContent + '\n')
    console.log(`Generated ${mainTSGenPath}!`)
  })
  .catch(console.error)
