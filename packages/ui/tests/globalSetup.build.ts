import { execSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import globalTeardown from './globalTeardown.build.js'
import { startServer } from './next-server.js'

/**
 * Production builds of the `next-build` fixture, served by `next start`.
 *
 * The dev-server suite cannot see anything about prerendering, because
 * `next dev` never prerenders: every page there renders at request time. The
 * failures this suite covers exist only in `next build` output — rules lost
 * from a statically generated page, and every rule emitted twice when Cache
 * Components renders the client tree in two passes.
 *
 * Two builds, one with Cache Components and one without, since the difference
 * between them is itself one of the things under test.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const FIXTURE = path.resolve(ROOT, 'tests/rsc-fixtures/next-build')
const STATE_FILE = path.resolve(ROOT, 'tests/rsc-fixtures/.build-servers.json')
/** Everything a variant's `next start` prints, for tests that check what the server reported. */
export const serverLog = (variant: string) => path.resolve(ROOT, `tests/rsc-fixtures/.build-server-${variant}.log`)

export const VARIANTS = {
  cc: { cacheComponents: true, distDir: '.next-cc' },
  plain: { cacheComponents: false, distDir: '.next-plain' },
} as const

export async function setup() {
  await globalTeardown()

  console.log('[build-setup] building @meonode/ui dist…')
  execSync('bun run build', { cwd: ROOT, stdio: 'inherit' })

  console.log('[build-setup] installing fixture deps…')
  execSync('bun install', { cwd: FIXTURE, stdio: 'inherit' })

  // Same reason as the dev suite: the fixture installs `@meonode/compiler` from
  // the registry, so the compiled run would otherwise validate whatever plugin
  // was last published rather than the one in this checkout.
  if (process.env.MEONODE_COMPILED === '1') {
    const built = path.resolve(ROOT, '../compiler/npm/meonode_swc_plugin.wasm')
    if (!existsSync(built)) {
      throw new Error(`Compiled build mode needs the @meonode/compiler wasm artifact at ${built}. Run \`bun run build:compiler\` from the repo root first.`)
    }
    copyFileSync(built, path.resolve(FIXTURE, 'node_modules/@meonode/compiler/meonode_swc_plugin.wasm'))
  }

  const servers: Record<string, { pid: number; port: number }> = {}
  for (const [name, variant] of Object.entries(VARIANTS)) {
    const env = {
      ...process.env,
      MEONODE_DIST_DIR: variant.distDir,
      MEONODE_CACHE_COMPONENTS: variant.cacheComponents ? '1' : '0',
    }
    // A stale build would measure the previous checkout's output.
    rmSync(path.resolve(FIXTURE, variant.distDir), { recursive: true, force: true })

    console.log(`[build-setup] next build (${name})…`)
    execSync('bunx next build', { cwd: FIXTURE, stdio: 'inherit', env })

    // Forwarded as before, and kept in a file so a test can read what the server reported.
    const log = serverLog(name)
    writeFileSync(log, '')
    // `-p 0`: the server takes a free port itself and says which, so no other
    // process can be listening where the tests send their requests.
    const { pid, port } = await startServer({
      name: `next start (${name})`,
      command: 'bunx',
      args: ['next', 'start', '-p', '0'],
      cwd: FIXTURE,
      env,
      timeoutMs: 60_000,
      onSpawn: pid => {
        servers[name] = { pid, port: 0 }
        writeFileSync(STATE_FILE, JSON.stringify(servers))
      },
      onOutput: (chunk, stream) => {
        ;(stream === 'stdout' ? process.stdout : process.stderr).write(chunk)
        appendFileSync(log, chunk)
      },
    })
    servers[name] = { pid, port }
    writeFileSync(STATE_FILE, JSON.stringify(servers))
    process.env[`__BUILD_PORT_${name.toUpperCase()}__`] = String(port)
  }
  console.log(`[build-setup] serving ${Object.keys(servers).join(', ')}`)
}

export const teardown = globalTeardown
