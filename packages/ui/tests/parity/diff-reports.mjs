// Compares two PARITY_REPORT files row by row, for checking a harness change
// against the harness before it on the same build: each row (case, mode and
// side) must have the same differences, not only the same verdict. Rows the
// two reports list as unstable are left out of the comparison.
//
// usage: node tests/parity/diff-reports.mjs <old report.json> <new report.json> [--sides=off,on]
// --sides compares only those row sides, for a new harness that reads rows the old one did not.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const [oldPath, newPath] = args.filter(a => !a.startsWith('--'))
const SIDES = args.find(a => a.startsWith('--sides='))?.slice('--sides='.length).split(',')
if (!oldPath || !newPath) throw new Error('usage: node tests/parity/diff-reports.mjs <old report.json> <new report.json>')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const before = read(oldPath)
const after = read(newPath)
if (before.engine !== after.engine) throw new Error(`the reports are from different engines: ${before.engine} and ${after.engine}`)

const rowOf = d => `${d.case} [${d.mode}] ${d.side}`
/** Forced-state units a report left out as unstable, by row: a state, or `<state> <element key>` for one element of it. */
const unstableOf = report => new Map(report.unstable.map(u => [rowOf(u), new Set(u.states)]))
const leftOut = [unstableOf(before), unstableOf(after)]
const isLeftOut = d => {
  if (d.dimension !== 'forced-state') return false
  const state = d.where.replace(/^element /, '')
  const units = [state, ...(d.entry ? [`${state} ${d.entry.split('/')[0]}`] : [])]
  return leftOut.some(map => units.some(unit => map.get(rowOf(d))?.has(unit)))
}
/** Each row's differences, as `dimension @ where: text`. */
function byRow(report) {
  const rows = new Map()
  for (const d of report.differences) {
    if (isLeftOut(d) || (SIDES && !SIDES.includes(d.side))) continue
    const row = rowOf(d)
    if (!rows.has(row)) rows.set(row, new Set())
    rows.get(row).add(`${d.dimension} @ ${d.where}: ${d.text}`)
  }
  return rows
}
const oldRows = byRow(before)
const newRows = byRow(after)
const cases = [new Set(Object.keys(before.timings)), new Set(Object.keys(after.timings))]
const onlyIn = (a, b) => [...a].filter(c => !b.has(c))
let mismatches = 0
for (const [label, list] of [
  ['cases only the old report read', onlyIn(cases[0], cases[1])],
  ['cases only the new report read', onlyIn(cases[1], cases[0])],
]) {
  if (!list.length) continue
  mismatches += list.length
  console.log(`${label}: ${list.join(', ')}`)
}
for (const row of [...new Set([...oldRows.keys(), ...newRows.keys()])].sort()) {
  const a = oldRows.get(row) ?? new Set()
  const b = newRows.get(row) ?? new Set()
  const lost = [...a].filter(k => !b.has(k))
  const gained = [...b].filter(k => !a.has(k))
  if (!lost.length && !gained.length) continue
  mismatches++
  console.log(`${row}: ${a.size ? 'FAIL' : 'ok'} before, ${b.size ? 'FAIL' : 'ok'} after; ${lost.length} difference(s) only before, ${gained.length} only after`)
  for (const k of [...lost.slice(0, 3).map(k => `  - ${k}`), ...gained.slice(0, 3).map(k => `  + ${k}`)]) console.log(k)
}
const shared = [...cases[0]].filter(c => cases[1].has(c)).length
console.log(
  mismatches
    ? `diff-reports: ${mismatches} mismatch(es) over ${shared} shared case(s)`
    : `diff-reports: the same differences in every row of ${shared} shared case(s)`,
)
process.exitCode = mismatches ? 1 : 0
