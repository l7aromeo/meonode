import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.resolve(__dirname, '..', 'tests/rsc-fixtures/.build-servers.json')

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Stops every server the build setup started, including ones a crashed run left behind. */
export default async function globalTeardown() {
  if (!existsSync(STATE_FILE)) return
  const servers = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Record<string, { pid: number }>
  for (const { pid } of Object.values(servers)) {
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
      if (!alive(pid)) break
      try {
        process.kill(-pid, signal)
      } catch {
        try {
          process.kill(pid, signal)
        } catch {
          /* gone */
        }
      }
      for (let i = 0; i < 10 && alive(pid); i++) await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  unlinkSync(STATE_FILE)
}
