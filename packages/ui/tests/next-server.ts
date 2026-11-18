import { spawn } from 'node:child_process'

/** The line Next prints once it listens: `- Local: http://localhost:PORT`. */
const LISTENING_LINE = /Local:\s+https?:\/\/[^\s:]+:(\d+)/

/** How much of a failed server's output an error carries. */
const OUTPUT_IN_ERROR = 8_000

/** How often readiness is polled once the server has said where it listens. */
const POLL_MS = 250

export interface ServerOptions {
  /** What the server is called in messages, such as `next start (cc)`. */
  name: string
  /** The command and its arguments; they must make the server pick its own port, as `-p 0` does. */
  command: string
  args: readonly string[]
  cwd: string
  env?: NodeJS.ProcessEnv
  timeoutMs: number
  /** Called with the child's pid as soon as it is spawned, so a teardown can stop it whatever happens next. */
  onSpawn?: (pid: number) => void
  /** Called with everything the child prints. */
  onOutput?: (chunk: Buffer, stream: 'stdout' | 'stderr') => void
}

/**
 * Starts a server that picks its own port, and resolves once that server answers.
 *
 * The port is the one the child reports it listens on, so nothing else can hold
 * it: a port chosen beforehand and handed over can be taken in between, and a
 * check that accepts whatever answers there then tests another process. The
 * child is watched until it is ready; if it exits or times out first, this
 * rejects with what it printed, and stops it.
 * @param options What to run and how to report it.
 * @returns The child's pid and the port it listens on.
 */
export function startServer(options: ServerOptions): Promise<{ pid: number; port: number }> {
  const child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  child.unref()
  if (child.pid !== undefined) options.onSpawn?.(child.pid)

  let output = ''
  let settled = false
  return new Promise((resolve, reject) => {
    const fail = (reason: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
      } catch {
        // already gone
      }
      reject(new Error(`${options.name} ${reason}.\n--- ${options.name} output ---\n${output.slice(-OUTPUT_IN_ERROR)}`))
    }
    const timer = setTimeout(() => fail(`did not become ready within ${options.timeoutMs}ms`), options.timeoutMs)

    const poll = async (port: number) => {
      while (!settled) {
        try {
          if ((await fetch(`http://localhost:${port}/`)).status < 500) break
        } catch {
          // not answering yet
        }
        await new Promise(r => setTimeout(r, POLL_MS))
      }
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.removeAllListeners('exit')
      resolve({ pid: child.pid!, port })
    }

    let port: number | undefined
    for (const [stream, name] of [
      [child.stdout, 'stdout'],
      [child.stderr, 'stderr'],
    ] as const) {
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8')
        options.onOutput?.(chunk, name)
        if (port !== undefined) return
        const listening = LISTENING_LINE.exec(output)
        if (listening) {
          port = Number(listening[1])
          void poll(port)
        }
      })
      ;(stream as unknown as { unref?: () => void }).unref?.()
    }
    child.on('exit', (code, signal) => fail(`exited before it was ready (code ${code}, signal ${signal})`))
    child.on('error', error => fail(`could not start: ${error.message}`))
  })
}
