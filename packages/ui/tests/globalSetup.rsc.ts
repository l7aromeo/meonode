import { execSync, spawn } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import globalTeardown from './globalTeardown.rsc.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const FIXTURE = path.resolve(ROOT, 'tests/rsc-fixtures/next-app')
const PID_FILE = path.resolve(ROOT, 'tests/rsc-fixtures/.rsc-server-pid')
const PORT_FILE = path.resolve(ROOT, 'tests/rsc-fixtures/.rsc-server-port')

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, () => {
      const addr = srv.address()
      if (typeof addr === 'object' && addr) {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error('Failed to get free port')))
      }
    })
    srv.on('error', reject)
  })
}

function killStaleServer() {
  if (!existsSync(PID_FILE)) return
  const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10)
  if (!Number.isFinite(pid)) return
  try {
    process.kill(pid, 'SIGTERM')

    console.log(`[rsc-setup] killed stale next dev pid=${pid}`)
  } catch {
    // already dead
  }
}

async function waitForReady(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`)
      if (res.status >= 200 && res.status < 500) {
        return
      }
      lastErr = new Error(`status ${res.status}`)
    } catch (e) {
      lastErr = e
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`next dev did not become ready on :${port} within ${timeoutMs}ms. Last error: ${lastErr}`)
}

/**
 * Every route the fixture's app directory serves, as request paths.
 *
 * Route groups (`(name)`) do not appear in the URL, private folders (`_name`) and
 * parallel slots (`@name`) are not routes of their own, and a dynamic segment
 * (`[name]`) has no value to request, so those pages are left out and named.
 */
function fixtureRoutes(): { routes: string[]; skipped: string[] } {
  const appDir = path.resolve(FIXTURE, 'app')
  const routes: string[] = []
  const skipped: string[] = []
  for (const file of readdirSync(appDir, { recursive: true, encoding: 'utf8' })) {
    const segments = file.split(path.sep)
    if (!/^page\.(ts|tsx|js|jsx)$/.test(segments.pop() ?? '')) continue
    if (segments.some(segment => segment.startsWith('_') || segment.startsWith('@'))) continue
    if (segments.some(segment => segment.startsWith('['))) {
      skipped.push(`/${segments.join('/')}`)
      continue
    }
    routes.push(`/${segments.filter(segment => !/^\(.*\)$/.test(segment)).join('/')}`)
  }
  return { routes: routes.sort(), skipped }
}

/** A dev-server line reporting a module that failed to compile: `⨯ ./path/to/file.ts:line:column`. */
const COMPILE_ERROR = /^\s*⨯ (\.\/\S+:\d+:\d+)\s*$/

/**
 * Requests every fixture route once, so each is compiled before any test runs.
 *
 * `next dev` compiles a route on its first request. Left to the tests, that
 * compile lands inside whichever case asks first and counts against its timeout,
 * and under load it has taken tens of seconds. Compiled here, a test's request
 * only renders.
 *
 * A route that fails to compile fails setup, naming the file. A route that
 * compiles and then answers 500 is not a failure here: some pages exist to be
 * rejected at render time, and their tests assert that.
 */
async function warmRoutes(port: number, serverOutput: string[]): Promise<void> {
  const { routes, skipped } = fixtureRoutes()
  if (skipped.length) console.log(`[rsc-setup] not warmed (dynamic segments): ${skipped.join(', ')}`)
  const started = Date.now()
  const from = serverOutput.length
  for (const route of routes) {
    await (await fetch(`http://localhost:${port}${route}`)).text()
  }
  const failed = serverOutput
    .slice(from)
    .map(line => COMPILE_ERROR.exec(line)?.[1])
    .filter((file): file is string => file !== undefined)
  if (failed.length) throw new Error(`[rsc-setup] fixture modules failed to compile:\n  ${[...new Set(failed)].join('\n  ')}`)
  console.log(`[rsc-setup] warmed ${routes.length} routes in ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

export async function setup() {
  killStaleServer()

  console.log('[rsc-setup] building @meonode/ui dist (bun run build)…')
  // Avoid recursive test loop: `build` runs `prebuild`, and `prebuild` includes `test:rsc`.
  execSync('bun run build', { cwd: ROOT, stdio: 'inherit' })

  console.log('[rsc-setup] installing fixture deps…')
  // The linked workspace package can change after dist rebuild; keep fixture install fresh.
  execSync('bun install', { cwd: FIXTURE, stdio: 'inherit' })

  // The fixture resolves `@meonode/ui` from the workspace but installs
  // `@meonode/compiler` from the registry, so without this the compiled run
  // would transform call sites with whatever plugin was last published rather
  // than the one in this checkout — it silently validated 0.4.0 for a while.
  //
  // Overwriting the installed copy is deliberate. Linking the workspace
  // package instead puts packages/compiler/npm inside turbopack's root but
  // outside any node_modules directory, and turbopack then tries to compile
  // its package.json as source. This has to happen after the install above,
  // which is why it lives here rather than in a package.json script.
  if (process.env.MEONODE_COMPILED === '1') {
    const built = path.resolve(ROOT, '../compiler/npm/meonode_swc_plugin.wasm')
    if (!existsSync(built)) {
      throw new Error(
        `Compiled RSC mode needs the @meonode/compiler wasm artifact, which is not at ${built}. Run \`bun run build:compiler\` from the repo root first.`,
      )
    }
    copyFileSync(built, path.resolve(FIXTURE, 'node_modules/@meonode/compiler/meonode_swc_plugin.wasm'))
    console.log('[rsc-setup] copied the freshly built wasm plugin over the fixture’s registry copy')
  }

  const port = await getFreePort()

  console.log(`[rsc-setup] spawning next dev on :${port}…`)

  const proc = spawn('bunx', ['next', 'dev', '-p', String(port)], {
    cwd: FIXTURE,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  proc.unref()

  // Forwarded as it arrives, and kept by line so the warm-up can read what the
  // server reported while compiling.
  const serverOutput: string[] = []
  for (const [stream, sink] of [
    [proc.stdout, process.stdout],
    [proc.stderr, process.stderr],
  ] as const) {
    stream.on('data', (chunk: Buffer) => {
      sink.write(chunk)
      serverOutput.push(...chunk.toString('utf8').split('\n'))
    })
    ;(stream as unknown as { unref?: () => void }).unref?.()
  }

  if (!proc.pid) throw new Error('failed to spawn next dev')
  writeFileSync(PID_FILE, String(proc.pid))
  writeFileSync(PORT_FILE, String(port))
  process.env.__RSC_FIXTURE_PORT__ = String(port)

  await waitForReady(port, 90_000)

  console.log('[rsc-setup] next dev ready')

  await warmRoutes(port, serverOutput)
}

export const teardown = globalTeardown
