// @vitest-environment node
//
// The RSC and build suites start a Next server and send every request to its
// port. When the setup picked a free port, closed it and handed the number to
// `next start`, another process could take it in between: the server failed
// with EADDRINUSE, the readiness check accepted the other process's answer, and
// the suite ran against it. `startServer` lets the server pick its own port and
// reads it from what the server prints, and fails at once, with that output,
// when the server stops before it is ready.
//
// A small Node script stands in for Next: it prints Next's `Local:` line, or
// fails the way Next does.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { startServer } from './next-server.js'

/** A stand-in for `next start -p <port>`, answering `own` on the port it listens on. */
const FAKE_NEXT = `
const http = require('node:http')
const port = Number(process.argv[1])
const server = http.createServer((_, res) => res.end('own'))
server.on('error', error => {
  console.error('⨯ Failed to start server')
  console.error(String(error))
  process.exit(1)
})
server.listen(port, () => {
  console.log('- Local:         http://localhost:' + server.address().port)
  console.log('✓ Ready')
})
`

const start = (port: number | string, timeoutMs = 10_000) =>
  startServer({ name: 'fake next', command: process.execPath, args: ['-e', FAKE_NEXT, String(port)], cwd: process.cwd(), timeoutMs })

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * How long a killed process may take to be gone before the test fails: far
 * past the few milliseconds it takes on a loaded machine, and short enough
 * that, after the test's 1 s readiness wait, the assertion still reports a
 * survivor inside vitest's 5 s test timeout.
 */
const EXIT_DEADLINE_MS = 3_000

/** How often to look whether it is gone: often enough to add nothing noticeable to the test. */
const EXIT_POLL_MS = 10

/** Resolves once `pid` is gone, or at {@link EXIT_DEADLINE_MS}, so the assertion after it reports a survivor. */
const gone = async (pid: number) => {
  const deadline = performance.now() + EXIT_DEADLINE_MS
  while (alive(pid) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, EXIT_POLL_MS))
}

const started: number[] = []
let impostor: Server | undefined

afterEach(async () => {
  for (const pid of started.splice(0)) if (alive(pid)) process.kill(-pid, 'SIGKILL')
  await new Promise(resolve => (impostor ? impostor.close(resolve) : resolve(undefined)))
  impostor = undefined
})

/** Another process's server, answering 200 on a port of its own. */
const listenImpostor = () =>
  new Promise<number>(resolve => {
    impostor = createServer((_, res) => res.end('impostor'))
    impostor.listen(0, () => resolve((impostor!.address() as AddressInfo).port))
  })

it('resolves with the port the server reports, which answers as that server', async () => {
  const { pid, port } = await start(0)
  started.push(pid)
  expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe('own')
})

it('fails at once, with the output, when another process holds the port, rather than test that process', async () => {
  const taken = await listenImpostor()
  const began = Date.now()
  await expect(start(taken)).rejects.toThrow(/exited before it was ready[\s\S]*Failed to start server[\s\S]*EADDRINUSE/)
  expect(Date.now() - began).toBeLessThan(5_000)
})

it('fails with the output, and stops the server, when it never says where it listens', async () => {
  let pid: number | undefined
  const silent = startServer({
    name: 'silent server',
    command: process.execPath,
    args: ['-e', "console.log('starting'); setInterval(() => {}, 1000)"],
    cwd: process.cwd(),
    timeoutMs: 1_000,
    onSpawn: spawned => {
      pid = spawned
      started.push(spawned)
    },
  })
  await expect(silent).rejects.toThrow(/did not become ready within 1000ms[\s\S]*starting/)
  await gone(pid!)
  expect(alive(pid!)).toBe(false)
})
