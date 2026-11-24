// The key warnings one run of a carrier page gives. React reports a missing key
// once per process for each host's name, so each counted run has a file of its
// own; a run expected to give none can share one, since the first that gives
// any fails before a later one could be hidden.
import { CASES, compiledStyle, run, runList, runtimeStyle } from '../_carrier-pages.js'

/** Whether the run compiles the test sources: a call site then carries its compiled key. */
export const COMPILED = process.env.MEONODE_COMPILED === '1'

/** The key warnings a counters page gives, toggled from `initially`. */
export function counterWarnings(name: string, side: 'runtime' | 'compiled', keyed: boolean, initially: boolean): number {
  const page = CASES[name]
  if (!page) throw new Error(`no counters page named ${name}`)
  return run(on => page(on, side === 'runtime' ? runtimeStyle : compiledStyle, keyed), initially).keyWarnings
}

/** The key warnings the generated list gives through its appends, removals and reorders. */
export const listWarnings = (side: 'runtime' | 'compiled', keyed: boolean): number =>
  runList(side === 'runtime' ? runtimeStyle : compiledStyle, keyed).keyWarnings
