import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as babel from '@babel/core'
import { generate } from '@babel/generator'

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
const CORE_UTILITY_SRC_PATH = path.join(SRC_GEN_DIR, 'core.ts')

/**
 * Defines the source files and output configurations for different MUI modules.
 * Each key represents a category of MUI components (e.g., 'mui.core', 'mui.lab').
 * @type {Object.<string, {srcFile: string, outputSubdir: string, muiPackage: string, typeSrcFile?: string, typeOutputSubdir?: string}>}
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
    typeSrcFile: path.join(SRC_DIR, 'lib', 'mui.x-data-grid.type.ts'),
    typeOutputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-data-grid'),
  },
  'mui.x-data-grid-pro': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-data-grid-pro.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-data-grid-pro'),
    muiPackage: '@mui/x-data-grid-pro',
    typeSrcFile: path.join(SRC_DIR, 'lib', 'mui.x-data-grid-pro.type.ts'),
    typeOutputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-data-grid-pro'),
  },
  'mui.x-data-grid-premium': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-data-grid-premium.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-data-grid-premium'),
    muiPackage: '@mui/x-data-grid-premium',
    typeSrcFile: path.join(SRC_DIR, 'lib', 'mui.x-data-grid-premium.type.ts'),
    typeOutputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-data-grid-premium'),
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
  'mui.x-tree-view-pro': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-tree-view-pro.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-tree-view-pro'),
    muiPackage: '@mui/x-tree-view-pro',
  },
}

/**
 * Processes a type definition file, renaming it to 'type.ts' and
 * rewriting internal relative imports to reflect the new src-gen structure
 * and the standardized 'type.ts' filename.
 * @param {string} srcFilePath The original path to the type definition file (e.g., .../mui.x-data-grid.type.ts).
 * @param {string} outputDirPath The directory where the processed file will be written (e.g., .../src-gen/lib/mui.x-data-grid).
 * @returns {Promise<void>}
 */
async function processTypeFile(srcFilePath, outputDirPath) {
  console.log(`Processing type file: ${srcFilePath}`)
  // The output file name will always be 'type.ts'
  const outputFileName = 'type.ts'
  const outputFilePath = path.join(outputDirPath, outputFileName)

  const sourceCode = fs.readFileSync(srcFilePath, 'utf8')
  const ast = babel.parseSync(sourceCode, {
    filename: srcFilePath,
    sourceType: 'module',
    presets: [path.resolve(PACKAGE_ROOT, 'node_modules', '@babel/preset-typescript')],
  })

  // Traverse and rewrite import paths
  babel.traverse(ast, {
    /**
     * Visits an ImportDeclaration node to modify import paths.
     * @param {Object} nodePath The Babel NodePath object.
     */
    ImportDeclaration(nodePath) {
      let importSourceValue = nodePath.node.source.value

      // Check if the import path starts with '@src/lib/' and points to a .type file
      if (importSourceValue.startsWith('@src/lib/') && importSourceValue.endsWith('.type')) {
        // Convert the `@src/` alias to a real path relative to PACKAGE_ROOT
        const originalRelativeSrcPath = importSourceValue.replace('@src/', 'src/')

        // Determine the target location in src-gen for the *imported* type file.
        // It should also be renamed to 'type.ts' in its respective output directory.
        const importedTypeBaseName = path.basename(originalRelativeSrcPath, '.ts')
        const importedTypeModuleName = importedTypeBaseName.replace(/\.type$/, '')

        const targetOutputSubdir = path.join(SRC_GEN_DIR, 'lib', importedTypeModuleName)
        const targetOutputFilePath = path.join(targetOutputSubdir, 'type.ts')

        // Calculate the relative path from the *current* type file's src-gen location (outputDirPath)
        // to the *target* type file's new location (targetOutputFilePath)
        let newRelativePath = path.relative(path.dirname(outputFilePath), targetOutputFilePath)

        // Ensure it starts with './' or '../' if it's a sibling or parent reference
        if (!newRelativePath.startsWith('.')) {
          newRelativePath = `./${newRelativePath}`
        }
        // Remove .ts extension from the import path, as is common in TS imports
        newRelativePath = newRelativePath.replace(/\.ts$/, '')

        nodePath.node.source.value = newRelativePath
        console.log(`  Rewrote import in type file: ${importSourceValue} -> ${nodePath.node.source.value}`)
      }
      // Other external MUI imports (e.g., '@mui/x-data-grid-pro') remain untouched
    },
  })

  const { code } = generate(ast, { retainLines: true, concise: false, decoratorsBeforeExport: true }, sourceCode)
  fs.writeFileSync(outputFilePath, code + '\n')
  console.log(`Copied and processed type file ${srcFilePath} to ${outputFilePath}`)
}

/**
 * Generates wrapper source files for MUI components.
 * This function performs the following steps:
 * 1. Cleans up the `src-gen` directory.
 * 2. Copies the core utility file to `src-gen`.
 * 3. Copies and processes .type.ts files to `src-gen`, renaming them to `type.ts`.
 * 4. Iterates through `MODULE_SOURCES` to process each MUI module components.
 * - Reads the component source file and parses it with Babel.
 * - Identifies component exports that use `createMuiNode`.
 * - Extracts necessary type information and imports.
 * - Generates a new wrapper file for each identified component in the `src-gen` subdirectory.
 * - Generates an `index.ts` file in each module's `src-gen` subdirectory that re-exports all generated components.
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
  const coreUtilitySrcPath = path.join(SRC_DIR, 'core.ts') // Original source path for core utility
  const coreUtilityGenPath = path.join(SRC_GEN_DIR, 'core.ts') // Target generated path for core utility
  fs.copyFileSync(coreUtilitySrcPath, coreUtilityGenPath)
  console.log(`Copied ${coreUtilitySrcPath} to ${coreUtilityGenPath}`)

  // Process and copy type definition files first
  for (const [, config] of Object.entries(MODULE_SOURCES)) {
    if (config.typeSrcFile && config.typeOutputSubdir) {
      fs.mkdirSync(config.typeOutputSubdir, { recursive: true })
      await processTypeFile(config.typeSrcFile, config.typeOutputSubdir)
    }
  }

  // Process each MUI module defined in MODULE_SOURCES (for components)
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
     * Updated to reflect src-gen paths for internal types, now pointing to './type'.
     * @type {Map<string, string>}
     */
    const typeImportMap = new Map()

    // First pass: Collect all type imports and their original sources
    // Now also consider the src-gen path for types that moved
    babel.traverse(ast, {
      /**
       * Visits an ImportDeclaration node to collect type import information and adjust paths.
       * @param {Object} nodePath The Babel NodePath object.
       */
      ImportDeclaration(nodePath) {
        let importSourceValue = nodePath.node.source.value
        // If the import is from '@src/lib/mui.x-data-grid-pro.type', adjust its source
        if (importSourceValue.startsWith('@src/lib/') && importSourceValue.endsWith('.type')) {
          // Example: importSourceValue = '@src/lib/mui.x-data-grid.type'
          const originalRelativeSrcPath = importSourceValue.replace('@src/', 'src/')

          // Determine the target location in src-gen for the *imported* type file.
          // It should also be renamed to 'type.ts' in its respective output directory.
          const importedTypeBaseName = path.basename(originalRelativeSrcPath, '.ts')
          const importedTypeModuleName = importedTypeBaseName.replace(/\.type$/, '')

          const targetOutputSubdirForImportedType = path.join(SRC_GEN_DIR, 'lib', importedTypeModuleName)
          const targetOutputFilePath = path.join(targetOutputSubdirForImportedType, 'type.ts') // This is the ABSOLUTE path to the *IMPORTED* type file's new location in src-gen

          // Use config.outputSubdir as the 'from' path for path.relative
          let newRelativePath = path.relative(config.outputSubdir, targetOutputFilePath)

          // Add console logs for debugging
          console.log(`--- Debugging Component Type Import Path ---`)
          console.log(`  Original importSourceValue: ${nodePath.node.source.value}`)
          console.log(`  Current component's output directory (config.outputSubdir): ${config.outputSubdir}`)
          console.log(`  Absolute path to target type file (newTypeFileGenPath): ${targetOutputFilePath}`)
          console.log(`  Result of path.relative (before adjustment): ${newRelativePath}`)
          console.log(`--- End Debug ---`)

          // If the type file is in the same directory, it should be './type'
          if (newRelativePath === 'type.ts') {
            importSourceValue = './type'
          } else {
            // For sibling/parent directories, ensure it starts with './' or '../' and remove .ts
            if (!newRelativePath.startsWith('.')) {
              newRelativePath = `./${newRelativePath}`
            }
            importSourceValue = newRelativePath.replace(/\.ts$/, '')
          }

          nodePath.node.source.value = importSourceValue
          console.log(`  Adjusted component import of type: ${nodePath.node.source.value} -> ${importSourceValue}`)
        }

        nodePath.node.specifiers.forEach(specifier => {
          if (
            (babel.types.isImportSpecifier(specifier) && babel.types.isIdentifier(specifier.imported)) ||
            (babel.types.isImportDefaultSpecifier(specifier) && babel.types.isIdentifier(specifier.local)) ||
            (babel.types.isImportNamespaceSpecifier(specifier) && babel.types.isIdentifier(specifier.local))
          ) {
            const importedName = babel.types.isImportSpecifier(specifier) ? specifier.imported.name : specifier.local.name
            typeImportMap.set(importedName, importSourceValue) // Use the potentially adjusted importSourceValue
          }
        })
      },
    })

    // Second pass: Identify components created with `createMuiNode`
    babel.traverse(ast, {
      /**
       * Visits an ExportNamedDeclaration node to identify `createMuiNode` components.
       * @param {Object} nodePath The Babel NodePath object.
       */
      ExportNamedDeclaration(nodePath) {
        if (nodePath.node.declaration?.type === 'VariableDeclaration') {
          nodePath.node.declaration.declarations.forEach(declarator => {
            if (
              declarator.type === 'VariableDeclarator' &&
              babel.types.isIdentifier(declarator.id) &&
              babel.types.isCallExpression(declarator.init) &&
              babel.types.isIdentifier(declarator.init.callee) &&
              declarator.init.callee.name === 'createMuiNode'
            ) {
              const exportName = declarator.id.name
              const arg = declarator.init.arguments[0]
              if (!babel.types.isIdentifier(arg)) return

              const muiAlias = arg.name
              const originalMuiComponentName = muiAlias.startsWith('Mui') ? muiAlias.slice(3) : muiAlias

              let typeAnnotation
              const typesToImport = new Set()

              const typeParams = declarator.init.typeParameters
              if (typeParams?.type === 'TSTypeParameterInstantiation' && typeParams.params.length > 0) {
                const typeNode = typeParams.params[0]
                typeAnnotation = sourceCode.slice(typeNode.start, typeNode.end)

                babel.traverse(
                  typeNode,
                  {
                    /**
                     * Visits a TSTypeReference node to collect type names.
                     * @param {Object} innerNodePath The Babel NodePath object.
                     */
                    TSTypeReference(innerNodePath) {
                      const typeName = innerNodePath.node.typeName
                      if (babel.types.isIdentifier(typeName)) {
                        const importedType = typeName.name
                        const importSource = typeImportMap.get(importedType) || config.muiPackage

                        typesToImport.add({ name: importedType, source: importSource })
                      }
                    },
                  },
                  nodePath.scope,
                  nodePath.parentPath,
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
      const relativeCreateMuiNodePath = path.relative(comp.srcGenOutputSubdir, CORE_UTILITY_SRC_PATH).replace(/\.ts$/, '')

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
          return `import type { ${Array.from(new Set(types)).join(', ')} } from '${source}'`
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

    // Include type exports in index.ts if a type file exists for this module
    if (config.typeSrcFile) {
      // The type file is now always 'type.ts' within the module directory
      const typeExports = `export * from './type'`
      if (indexExports) {
        fs.writeFileSync(path.join(config.outputSubdir, 'index.ts'), indexExports + '\n' + typeExports + '\n')
      } else {
        fs.writeFileSync(path.join(config.outputSubdir, 'index.ts'), typeExports + '\n')
      }
      console.log(`- Generated ${path.join(config.outputSubdir, 'index.ts')} (including types from ./type)`)
    } else {
      if (indexExports) {
        const indexPath = path.join(config.outputSubdir, 'index.ts')
        fs.writeFileSync(indexPath, indexExports + '\n')
        console.log(`- Generated ${indexPath}`)
      }
    }
  }

  console.log('Generated all intermediate source files in src-gen/!')
}

// Execute the generation function and catch any errors
generateWrapperSourceFiles()
  .then(() => {
    // Generate the main.ts file in src-gen
    const mainTSGenPath = path.join(SRC_GEN_DIR, 'main.ts')
    const mainTSContent = `
export * from './core'
export * from './lib/mui.core'
// Consider adding exports for other module indexes here if you need them to be
// directly accessible from 'src-gen/main'. For example:
// export * from './lib/mui.x-data-grid'
`.trim()
    fs.writeFileSync(mainTSGenPath, mainTSContent + '\n')
    console.log(`Generated ${mainTSGenPath}!`)
  })
  .catch(console.error)
