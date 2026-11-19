// Builds rollup.config.ts the way `rollup -c --configPlugin typescript` does, with one
// resolution of the mui.core barrel held back, and prints every output file's sha256 by
// format, plus the routes the barrel was resolved by. Run by build-order.test.ts under node:
// the rollup typescript plugin is several times slower under bun's runtime.
//
// usage: node build-order.harness.js <entry|import>
//   entry   holds back the barrel's resolution as an entry, so main.ts's import of it runs first
//   import  holds back main.ts's import of the barrel, so its resolution as an entry runs first
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rollup } from 'rollup'
import { loadConfigFile } from 'rollup/loadConfigFile'

const PACKAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
/** How long the held-back resolution waits: long enough that the other one always completes first. */
const HOLD_MS = 300

const held = process.argv[2]
if (held !== 'entry' && held !== 'import') throw new Error('usage: build-order.harness.js <entry|import>')

const routes = new Set()
const holdBack = {
  name: 'hold-back-barrel-resolution',
  async resolveId(source, importer) {
    const asEntry = importer === undefined && source.endsWith('src/lib/mui.core/index.ts')
    const asImport = importer?.endsWith(path.join('src', 'main.ts')) === true && source.endsWith('lib/mui.core/index.js')
    if (asEntry) routes.add('entry')
    if (asImport) routes.add('import')
    if ((held === 'entry' && asEntry) || (held === 'import' && asImport)) await new Promise(resolve => setTimeout(resolve, HOLD_MS))
    return null
  },
}

process.chdir(PACKAGE_DIR)
const { options } = await loadConfigFile(path.join(PACKAGE_DIR, 'rollup.config.ts'), { configPlugin: 'typescript', silent: true })
const files = {}
for (const config of options) {
  const bundle = await rollup({ ...config, plugins: [holdBack, ...config.plugins], onLog: () => {} })
  try {
    for (const outputOptions of config.output) {
      const { output } = await bundle.generate(outputOptions)
      for (const file of output) {
        const content = file.type === 'chunk' ? file.code : file.source
        files[`${outputOptions.format}/${file.fileName}`] = createHash('sha256').update(content).digest('hex')
      }
    }
  } finally {
    await bundle.close()
  }
}
console.log(JSON.stringify({ routes: [...routes].sort(), files }))
