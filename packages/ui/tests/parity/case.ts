// The shape of a parity case module: `export const meta: CaseMeta` and
// `export function App(): ReactElement`.

/** One step of a case's state script, run in order after hydration. */
export interface CaseStep {
  /** Names the step in reports. */
  name: string
  /** Clicks the first element this selector matches, then moves the pointer away. */
  click?: string
  /** Types text into the first element this selector matches. */
  type?: [selector: string, text: string]
  /** Switches the page's theme mode. */
  mode?: 'light' | 'dark'
}

export interface CaseMeta {
  /** The styling shapes the case uses, from inventory.mjs. */
  shapes: string[]
  /** The compiler routes its css entries take, from inventory.mjs. */
  routes: string[]
  /** Breakpoints its at-rules use, in px; each is checked at -1, 0 and +1. */
  breakpoints?: number[]
  /** Its state script. */
  steps?: CaseStep[]

  /**
   * Entries the compiler documents as left on the runtime path although their
   * value is static (prefixed properties, shorthand beside longhand, …). A case
   * tagged STATIC, SWITCH or VAR whose compiled output carries no extraction
   * marker must name them here.
   */
  leftOnRuntime?: string[]
  /** How the page is produced: server HTML then hydration (default), a client render only, or a streamed server render. */
  render?: 'hydrate' | 'client' | 'stream'
}
