import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as babel from '@babel/core'
import { generate } from '@babel/generator'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(PACKAGE_ROOT, 'src')
const SRC_GEN_DIR = path.join(PACKAGE_ROOT, 'src-gen')
const CORE_UTILITY_SRC_PATH = path.join(SRC_GEN_DIR, 'core.ts')

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
    typeSrcFile: path.join(SRC_DIR, 'lib', 'mui.x-charts.type.ts'),
    typeOutputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-charts'),
  },
  'mui.x-charts-pro': {
    srcFile: path.join(SRC_DIR, 'lib', 'mui.x-charts-pro.ts'),
    outputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-charts-pro'),
    muiPackage: '@mui/x-charts-pro',
    typeSrcFile: path.join(SRC_DIR, 'lib', 'mui.x-charts-pro.type.ts'),
    typeOutputSubdir: path.join(SRC_GEN_DIR, 'lib', 'mui.x-charts-pro'),
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

async function processTypeFile(srcFilePath, outputDirPath) {
  console.log(`Processing type file: ${srcFilePath}`)
  const outputFileName = 'type.ts'
  const outputFilePath = path.join(outputDirPath, outputFileName)

  const sourceCode = fs.readFileSync(srcFilePath, 'utf8')
  const ast = babel.parseSync(sourceCode, {
    filename: srcFilePath,
    sourceType: 'module',
    presets: [path.resolve(PACKAGE_ROOT, 'node_modules', '@babel/preset-typescript')],
  })

  babel.traverse(ast, {
    ImportDeclaration(nodePath) {
      let importSourceValue = nodePath.node.source.value
      if (importSourceValue.startsWith('@src/lib/') && importSourceValue.endsWith('.type')) {
        const originalRelativeSrcPath = importSourceValue.replace('@src/', 'src/')
        const importedTypeBaseName = path.basename(originalRelativeSrcPath, '.ts')
        const importedTypeModuleName = importedTypeBaseName.replace(/\.type$/, '')
        const targetOutputSubdir = path.join(SRC_GEN_DIR, 'lib', importedTypeModuleName)
        const targetOutputFilePath = path.join(targetOutputSubdir, 'type.ts')
        let newRelativePath = path.relative(path.dirname(outputFilePath), targetOutputFilePath)
        if (!newRelativePath.startsWith('.')) {
          newRelativePath = `./${newRelativePath}`
        }
        newRelativePath = newRelativePath.replace(/\.ts$/, '')
        nodePath.node.source.value = newRelativePath
        console.log(`  Rewrote import in type file: ${importSourceValue} -> ${nodePath.node.source.value}`)
      }
    },
  })

  const { code } = generate(ast, { retainLines: true, concise: false, decoratorsBeforeExport: true }, sourceCode)
  fs.writeFileSync(outputFilePath, code + '\n')
  console.log(`Copied and processed type file ${srcFilePath} to ${outputFilePath}`)
}

function extractTypeIdentifiers(typeNode) {
  const typeNames = new Set()

  function walk(node) {
    if (!node || typeof node !== 'object') return

    if (node.type === 'TSTypeReference') {
      if (node.typeName.type === 'Identifier') {
        typeNames.add(node.typeName.name)
      }
      if (node.typeName.type === 'TSQualifiedName') {
        // For React.FC style
        let obj = node.typeName
        let cur = obj
        while (cur.left) cur = cur.left
        if (cur.type === 'Identifier') {
          typeNames.add(obj.left.name + '.' + obj.right.name)
        }
      }
    }
    // Recursively walk child nodes
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(walk)
      } else if (typeof node[key] === 'object' && node[key] !== null) {
        walk(node[key])
      }
    }
  }

  walk(typeNode)
  return Array.from(typeNames)
}

async function generateWrapperSourceFiles() {
  if (fs.existsSync(SRC_GEN_DIR)) {
    fs.rmSync(SRC_GEN_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(SRC_GEN_DIR, { recursive: true })

  // Copy the core utility file
  const coreUtilitySrcPath = path.join(SRC_DIR, 'core.ts')
  const coreUtilityGenPath = path.join(SRC_GEN_DIR, 'core.ts')
  fs.copyFileSync(coreUtilitySrcPath, coreUtilityGenPath)
  console.log(`Copied ${coreUtilitySrcPath} to ${coreUtilityGenPath}`)

  // Process and copy type definition files first
  for (const [, config] of Object.entries(MODULE_SOURCES)) {
    if (config.typeSrcFile && config.typeOutputSubdir) {
      fs.mkdirSync(config.typeOutputSubdir, { recursive: true })
      await processTypeFile(config.typeSrcFile, config.typeOutputSubdir)
    }
  }

  for (const [categoryKey, config] of Object.entries(MODULE_SOURCES)) {
    console.log(`Processing ${config.srcFile} for ${categoryKey} components...`)
    fs.mkdirSync(config.outputSubdir, { recursive: true })

    const sourceCode = fs.readFileSync(config.srcFile, 'utf8')
    const ast = babel.parseSync(sourceCode, {
      filename: config.srcFile,
      sourceType: 'module',
      presets: [path.resolve(PACKAGE_ROOT, 'node_modules', '@babel/preset-typescript')],
    })

    const componentsToGenerate = []
    const typeImportMap = new Map()

    // First pass: Collect all type imports and their original sources
    babel.traverse(ast, {
      ImportDeclaration(nodePath) {
        let importSourceValue = nodePath.node.source.value
        if (importSourceValue.startsWith('@src/lib/') && importSourceValue.endsWith('.type')) {
          const originalRelativeSrcPath = importSourceValue.replace('@src/', 'src/')
          const importedTypeBaseName = path.basename(originalRelativeSrcPath, '.ts')
          const importedTypeModuleName = importedTypeBaseName.replace(/\.type$/, '')
          const targetOutputSubdirForImportedType = path.join(SRC_GEN_DIR, 'lib', importedTypeModuleName)
          const targetOutputFilePath = path.join(targetOutputSubdirForImportedType, 'type.ts')
          let newRelativePath = path.relative(config.outputSubdir, targetOutputFilePath)
          if (newRelativePath === 'type.ts') {
            importSourceValue = './type'
          } else {
            if (!newRelativePath.startsWith('.')) {
              newRelativePath = `./${newRelativePath}`
            }
            importSourceValue = newRelativePath.replace(/\.ts$/, '')
          }
          nodePath.node.source.value = importSourceValue
        }

        nodePath.node.specifiers.forEach(specifier => {
          let importedName
          if (babel.types.isImportSpecifier(specifier) && babel.types.isIdentifier(specifier.imported)) {
            importedName = specifier.imported.name
          } else if (babel.types.isImportDefaultSpecifier(specifier) && babel.types.isIdentifier(specifier.local)) {
            importedName = specifier.local.name
          } else if (babel.types.isImportNamespaceSpecifier(specifier) && babel.types.isIdentifier(specifier.local)) {
            importedName = specifier.local.name
          }
          if (importedName) {
            typeImportMap.set(importedName, importSourceValue)
          }
        })
      },
    })

    // Second pass: Identify components created with `createMuiNode`
    babel.traverse(ast, {
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
              let muiAlias,
                typeAnnotationNode,
                typeAnnotation,
                isAsPattern = false

              // Pattern 1: createMuiNode(MuiBox as OverridableComponent<BoxTypeMap>)
              if (babel.types.isTSAsExpression(arg) && babel.types.isIdentifier(arg.expression)) {
                muiAlias = arg.expression.name
                typeAnnotationNode = arg.typeAnnotation
                typeAnnotation = sourceCode.slice(typeAnnotationNode.start, typeAnnotationNode.end)
                isAsPattern = true
              }
              // Pattern 2: createMuiNode<OverridableComponent<BoxTypeMap>>(MuiBox)
              else if (babel.types.isIdentifier(arg)) {
                muiAlias = arg.name
                const typeParams = declarator.init.typeParameters
                if (typeParams?.type === 'TSTypeParameterInstantiation' && typeParams.params.length > 0) {
                  typeAnnotationNode = typeParams.params[0]
                  typeAnnotation = sourceCode.slice(typeAnnotationNode.start, typeAnnotationNode.end)
                }
              } else {
                return
              }

              const originalMuiComponentName = muiAlias.startsWith('Mui') ? muiAlias.slice(3) : muiAlias
              const typesToImport = new Set()

              if (typeAnnotationNode) {
                for (const typeName of extractTypeIdentifiers(typeAnnotationNode)) {
                  if (typeName.includes('.')) {
                    if (typeName.startsWith('React.')) {
                      typesToImport.add({ name: null, source: 'react' })
                    }
                  } else {
                    const importSource = typeImportMap.get(typeName) || config.muiPackage
                    typesToImport.add({ name: typeName, source: importSource })
                  }
                }
              }

              componentsToGenerate.push({
                exportName,
                muiAlias,
                originalMuiComponentName,
                muiPackage: config.muiPackage,
                srcGenOutputSubdir: config.outputSubdir,
                typeAnnotation,
                typesToImport: Array.from(typesToImport),
                isAsPattern,
              })
            }
          })
        }
      },
    })

    // Generate individual wrapper files for each identified component
    for (const comp of componentsToGenerate) {
      const relativeCreateMuiNodePath = path.relative(comp.srcGenOutputSubdir, CORE_UTILITY_SRC_PATH).replace(/\.ts$/, '')
      const typeImportsBySource = new Map()
      let needsReactImport = false
      for (const typeDef of comp.typesToImport) {
        if (typeDef.name === null && typeDef.source === 'react') {
          needsReactImport = true
        } else if (typeDef.name) {
          if (!typeImportsBySource.has(typeDef.source)) {
            typeImportsBySource.set(typeDef.source, new Set())
          }
          typeImportsBySource.get(typeDef.source).add(typeDef.name)
        }
      }
      const typeImportLines = Array.from(typeImportsBySource.entries())
        .map(([source, names]) => `import type { ${Array.from(names).join(', ')} } from '${source}'`)
        .join('\n')
      const importReactLine = needsReactImport ? `import React from 'react'` : ''

      let wrapperCall
      if (comp.typeAnnotation && comp.isAsPattern) {
        wrapperCall = `createMuiNode(${comp.muiAlias} as ${comp.typeAnnotation})`
      } else if (comp.typeAnnotation) {
        wrapperCall = `createMuiNode<${comp.typeAnnotation}>(${comp.muiAlias})`
      } else {
        wrapperCall = `createMuiNode(${comp.muiAlias})`
      }

      const individualComponentCode = `
${typeImportLines}
${importReactLine ? importReactLine + '\n' : ''}
import { createMuiNode } from '${relativeCreateMuiNodePath}'
import { ${comp.originalMuiComponentName} as ${comp.muiAlias} } from '${comp.muiPackage}'

const ${comp.exportName} = ${wrapperCall}
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
    if (config.typeSrcFile) {
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

generateWrapperSourceFiles()
  .then(() => {
    const mainTSGenPath = path.join(SRC_GEN_DIR, 'main.ts')
    const mainTSContent = `
export * from './core'
export * from './lib/mui.core'
`.trim()
    fs.writeFileSync(mainTSGenPath, mainTSContent + '\n')
    console.log(`Generated ${mainTSGenPath}!`)
  })
  .catch(console.error)
