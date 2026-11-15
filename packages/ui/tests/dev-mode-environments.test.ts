import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, type Browser, type Page } from 'playwright'
import { rolldown } from 'rolldown'
import { build, createServer, preview, type InlineConfig } from 'vite'

/**
 * Development diagnostics must switch on wherever the code runs in development
 * and off in every production build, without the app providing a `process`
 * global. Each case loads the built package the way that environment does and
 * looks for the warning an undefined theme token produces in development.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = path.resolve(ROOT, 'tests/dev-mode-fixtures/vite')
const COMMON_CONST = path.resolve(ROOT, 'dist/esm/constant/common.const.js')
const TOKEN_WARNING = 'theme.primary.missing (used for `color`) is not defined by the active theme'

let browser: Browser
const scratch: string[] = []
// Vitest sets NODE_ENV=test, Vite takes an existing NODE_ENV as the value to
// substitute, and a Vite dev server sets it to development when it finds it
// unset. Each case clears it first, so Vite runs as from a fresh shell: `vite`
// substitutes development and `vite build` production.
// Typed as a plain record: framework type declarations make NODE_ENV read-only.
const env = process.env as Record<string, string | undefined>
const inheritedNodeEnv = env.NODE_ENV

beforeAll(async () => {
  browser = await chromium.launch()
})

afterAll(async () => {
  env.NODE_ENV = inheritedNodeEnv
  await browser?.close()
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

const tempDir = (label: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), `meonode-dev-mode-${label}-`))
  scratch.push(dir)
  return dir
}

interface PageReport {
  tokenWarning: boolean
  pageErrors: string[]
}

/** Opens a page, waits for the probe element, and reports what the console said. */
async function visit(url: string, ready: (page: Page) => Promise<unknown>): Promise<PageReport> {
  const page = await browser.newPage()
  const warnings: string[] = []
  const pageErrors: string[] = []
  page.on('console', message => warnings.push(message.text()))
  page.on('pageerror', error => pageErrors.push(error.message))
  try {
    await page.goto(url)
    await ready(page)
    return { tokenWarning: warnings.some(text => text.includes(TOKEN_WARNING)), pageErrors }
  } finally {
    await page.close()
  }
}

const probeRendered = (page: Page) => page.locator('#probe').waitFor({ timeout: 30_000 })

const viteConfig = (overrides: InlineConfig = {}): InlineConfig => {
  delete env.NODE_ENV
  return {
    root: FIXTURE,
    configFile: false,
    logLevel: 'silent',
    cacheDir: tempDir('vite-cache'),
    ...overrides,
  }
}

describe('development diagnostics by environment', () => {
  // The workspace links `@meonode/ui`, so Vite serves it as source: its modules
  // reach the browser one by one rather than through the dependency optimizer.
  it('are on under vite dev with the package served unbundled', async () => {
    const server = await createServer(viteConfig({ server: { port: 0, strictPort: false } }))
    try {
      await server.listen()
      const report = await visit(server.resolvedUrls!.local[0], probeRendered)
      expect(report.pageErrors).toEqual([])
      expect(report.tokenWarning).toBe(true)
    } finally {
      await server.close()
    }
  })

  // An installed package goes through the dependency optimizer instead; forcing
  // the linked one in takes the same path.
  it('are on under vite dev with the package pre-bundled', async () => {
    const server = await createServer(
      viteConfig({
        server: { port: 0, strictPort: false },
        optimizeDeps: { include: ['@meonode/ui', '@meonode/ui/client'] },
      }),
    )
    try {
      await server.listen()
      const report = await visit(server.resolvedUrls!.local[0], probeRendered)
      expect(report.pageErrors).toEqual([])
      expect(report.tokenWarning).toBe(true)
    } finally {
      await server.close()
    }
  })

  it('are off in a vite build, with the development check folded to a constant', async () => {
    const outDir = tempDir('vite-build')
    await build(viteConfig({ build: { outDir, emptyOutDir: true } }))
    const bundle = readdirSync(path.join(outDir, 'assets'))
      .filter(file => file.endsWith('.js'))
      .map(file => readFileSync(path.join(outDir, 'assets', file), 'utf8'))
      .join('\n')
    // Substituted and folded: nothing in the bundle reads NODE_ENV at runtime.
    expect(bundle).not.toMatch(/process\.env/)
    // The messages ship on purpose, so `setDebugMode(true)` can still turn them on.
    expect(bundle).toContain('is not defined by the active theme')

    const server = await preview(viteConfig({ build: { outDir }, preview: { port: 0, strictPort: false } }))
    try {
      const report = await visit(server.resolvedUrls!.local[0], probeRendered)
      expect(report.pageErrors).toEqual([])
      expect(report.tokenWarning).toBe(false)
    } finally {
      await server.close()
    }
  })

  /** Serves `source` as a module page and reads back what it stored on `window`. */
  async function devModeInBrowser(source: string, importMap?: Record<string, string>) {
    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.route('http://fixture.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/') {
        const map = importMap ? `<script type="importmap">${JSON.stringify({ imports: importMap })}</script>` : ''
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><head>${map}<script type="module" src="/entry.js"></script></head></html>`,
        })
      }
      if (pathname === '/entry.js') return route.fulfill({ contentType: 'text/javascript', body: source })
      if (pathname === '/common.const.js') {
        return route.fulfill({ contentType: 'text/javascript', body: readFileSync(COMMON_CONST, 'utf8') })
      }
      return route.fulfill({ status: 404 })
    })
    try {
      await page.goto('http://fixture.test/')
      await page.waitForFunction(() => 'devMode' in window)
      return { devMode: await page.evaluate(() => (window as unknown as { devMode: boolean }).devMode), pageErrors }
    } finally {
      await page.close()
    }
  }

  it('are off, without a ReferenceError, when the ESM build loads from an import map', async () => {
    const result = await devModeInBrowser("import { isDevMode } from '@meonode/ui/common'\nwindow.devMode = isDevMode()\n", {
      '@meonode/ui/common': '/common.const.js',
    })
    expect(result).toEqual({ devMode: false, pageErrors: [] })
  })

  it('are off in a browser bundle that defines nothing for NODE_ENV', async () => {
    const outDir = tempDir('rolldown')
    const entry = path.join(outDir, 'entry.js')
    writeFileSync(entry, `import { isDevMode } from ${JSON.stringify(COMMON_CONST)}\nwindow.devMode = isDevMode()\n`)
    const bundle = await rolldown({ input: entry, platform: 'neutral' })
    const { output } = await bundle.generate({ format: 'esm' })
    await bundle.close()
    const code = output[0].code
    // The case only means something if the read reached the bundle unreplaced.
    expect(code).toMatch(/process\.env\??\.NODE_ENV/)
    expect(await devModeInBrowser(code)).toEqual({ devMode: false, pageErrors: [] })
  })

  /** Renders the fixture's probe on the server in a fresh Node process and returns its stderr. */
  async function serverRenderStderr(nodeEnv: string | undefined) {
    const script = [
      "import { renderToString } from 'react-dom/server'",
      "import { Div, Node, ThemeProvider } from '@meonode/ui'",
      'const App = () => ThemeProvider({',
      "  modes: ['light'], defaultMode: 'light',",
      "  tokens: { primary: { default: 'rgb(1, 2, 3)' } },",
      "  children: Div({ id: 'probe', color: 'theme.primary.missing', children: 'probe' }),",
      '}).render()',
      'renderToString(Node(App).render())',
    ].join('\n')
    const childEnv: Record<string, string | undefined> = { ...process.env }
    delete childEnv.NODE_ENV
    if (nodeEnv !== undefined) childEnv.NODE_ENV = nodeEnv
    const { stderr } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      // The framework augmentation makes NODE_ENV required; leaving it out is the point.
      env: childEnv as NodeJS.ProcessEnv,
    })
    return stderr
  }

  it('are on in Node server rendering when NODE_ENV is unset', async () => {
    expect(await serverRenderStderr(undefined)).toContain(TOKEN_WARNING)
  })

  it('are off in Node server rendering when NODE_ENV is production', async () => {
    expect(await serverRenderStderr('production')).not.toContain(TOKEN_WARNING)
  })
})
