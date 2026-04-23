import path from 'node:path'
import { fileURLToPath } from 'node:url'
import alias from '@rollup/plugin-alias'
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import esbuild from 'rollup-plugin-esbuild'
import { defineConfig, type ExternalOption } from 'rollup'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SRC_DIR = path.resolve(__dirname, 'src')

const input = [
  'src/main.ts',
  'src/core.ts',
  'src/lib/mui.core/index.ts',
  'src/lib/mui.lab/index.ts',
  'src/lib/mui.x-date-pickers/index.ts',
  'src/lib/mui.x-date-pickers-pro/index.ts',
  'src/lib/mui.x-data-grid/index.ts',
  'src/lib/mui.x-data-grid-pro/index.ts',
  'src/lib/mui.x-data-grid-premium/index.ts',
  'src/lib/mui.x-charts/index.ts',
  'src/lib/mui.x-charts-pro/index.ts',
  'src/lib/mui.x-tree-view/index.ts',
  'src/lib/mui.x-tree-view-pro/index.ts',
]

const external: ExternalOption = id => !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('src/') && !id.startsWith('@src/')

const plugins = [
  alias({
    entries: [{ find: '@src', replacement: SRC_DIR }],
  }),
  typescript({
    tsconfig: './tsconfig.build.json',
    declaration: false,
    declarationMap: false,
    outDir: undefined,
  }),
  nodeResolve({
    extensions: ['.mjs', '.js', '.json', '.ts', '.tsx'],
  }),
  commonjs(),
  esbuild({
    target: 'es2020',
    sourceMap: true,
    tsconfig: path.resolve(__dirname, 'tsconfig.json'),
  }),
]

export default defineConfig([
  {
    input,
    external,
    plugins,
    output: {
      dir: 'dist/esm',
      format: 'esm',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].js',
      strict: true,
    },
  },
  {
    input,
    external,
    plugins,
    output: {
      dir: 'dist/cjs',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].cjs',
      strict: true,
    },
  },
])
