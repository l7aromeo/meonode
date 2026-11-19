// The build must write the same files whatever order rollup happens to resolve modules in.
//
// rollup resolves an entry's imports and the other entries concurrently, and the first
// resolution of a module fixes its `moduleSideEffects`. The mui.core barrel is both an
// entry (resolved by node-resolve, which reads `"sideEffects": false` from package.json)
// and an import of src/main.ts (resolved by the typescript plugin, which reports nothing,
// so rollup's own default applies). Which reading the barrel got decided the order of
// main.js's re-exports: its import order when the barrel counted as having side effects,
// otherwise the sorted export names. So two builds of one commit could differ by timing.
//
// Each build below holds back one of the two resolutions, so the other one runs first, and
// the two must write identical files. Needs `bun run build:ui` first, for @meonode/ui's types.
import { expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const HARNESS = path.join(import.meta.dir, 'build-order.harness.js')
/** Room for the harness's JSON: one sha256 per output file, about 4,000 files, with a wide margin. */
const MAX_HARNESS_OUTPUT = 16 * 1024 * 1024

/** Every output file's sha256, by `<format>/<file>`, with one barrel resolution held back. */
const build = (held: 'entry' | 'import') => {
  const run = spawnSync('node', [HARNESS, held], { encoding: 'utf8', maxBuffer: MAX_HARNESS_OUTPUT })
  if (run.status !== 0) throw new Error(`build-order harness (${held}) failed:\n${run.stderr}`)
  return JSON.parse(run.stdout) as { routes: string[]; files: Record<string, string> }
}

it('writes the same files whichever resolution of the mui.core barrel runs first', () => {
  const entryFirst = build('import')
  const importFirst = build('entry')
  // Without both routes there is no race to hold back, and the comparison proves nothing.
  expect(entryFirst.routes).toEqual(['entry', 'import'])
  expect(importFirst.routes).toEqual(['entry', 'import'])
  expect(Object.keys(importFirst.files).sort()).toEqual(Object.keys(entryFirst.files).sort())
  const differing = Object.keys(entryFirst.files).filter(name => importFirst.files[name] !== entryFirst.files[name])
  expect(differing).toEqual([])
}, 300_000)
