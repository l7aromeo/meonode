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
   * The route each named node takes on the "on" side, whole, checked on its
   * compiled output: so a route a case is tagged with is proven on a node,
   * and a passing run cannot come from everything staying on the runtime path.
   */
  routing?: NodeRouting[]
  /** Differences the comparison expects, each of which must appear on the sides it names. */
  expected?: ExpectedDifference[]

  /** A stylesheet of the case's own, placed in the head after the page's, as a site's CSS. */
  pageCss?: string

  /**
   * The inventory a generated page comes from. Its routes are whatever the
   * compiler gives the shapes, so `routes` may be empty and the gate does not
   * check its extraction markers; the browser result gates it.
   */
  generatedFrom?: 'selectors' | 'atrules' | 'grammar'
  /** The inventory selectors (selectors.mjs) the case exercises. */
  selectors?: string[]
  /** The inventory at-rules (atrules.mjs, by `id`) the case exercises. */
  atrules?: string[]
  /** Custom properties read on every element beside the standard ones, since engines do not list them all in computed style. */
  customProps?: string[]
  /** The server-render modes the page is checked in: plain and under the Next.js registry (default), or plain only. */
  serverModes?: Array<'plain' | 'registry'>

  /**
   * Also record the server HTML before hydration (client bundle withheld), for
   * shapes whose server `<style>` siblings decide what matches until the
   * client moves them: `:first-child`, `:nth-child`, `+`. Not for client cases.
   */
  firstPaint?: boolean
  /** Also record the base environment with `prefers-reduced-motion: reduce` emulated. */
  reducedMotion?: boolean
  /** Pseudo-classes forced together on each forced element, beyond the single ones (`['hover', 'focus-within']`). */
  forceCombos?: string[][]
  /** Which elements get forced pseudo-classes: all (default), or only those marked `data-parity-force`. */
  force?: 'all' | 'marked'
  /** What a read while one element is forced covers: every element (default), or only the `data-parity-scope` element around it. */
  forceScope?: 'page' | 'fixture'
  /** The environments recorded: every colour scheme and theme mode (default), or the light ones only. */
  environments?: 'all' | 'base'

  /**
   * How the page is produced: server HTML then hydration (default), a client
   * render only, a streamed server render sent once every boundary is ready,
   * one sent from the shell on (later boundaries arrive after it, swapped in
   * by React's scripts), or a server component (Flight on
   * the server layer, then server HTML from the payload, hydrated from it).
   */
  render?: 'hydrate' | 'client' | 'stream' | 'stream-late' | 'rsc'
}

/** One node's routing on the "on" side, found by its `key` prop. */
export interface NodeRouting {
  /** The node's `key`. */
  node: string

  /**
   * The route this node proves, from inventory.mjs, derived from the design
   * (what its source holds), never read off the compiled output. The node is
   * routed whole: named, templated, joined or left on the runtime path.
   */
  route: string

  /**
   * The compiler marks this node as a carrier (`__meo$r`), by the design's
   * carrier rule, on a route other than CARRIER: a themed or merged node. A
   * CARRIER node is one by its route; every other node must not carry the mark.
   */
  carrier?: true
}

/** A difference from the oracle that is known and recorded, not a failure. */
export interface ExpectedDifference {
  /** Why the difference exists. */
  reason: string

  /**
   * The sides it appears on: `runtime-modes` is the registry check, the
   * runtime's [registry] render against its [plain] one.
   */
  sides: Array<'off' | 'on' | 'runtime-modes'>
  /** The server-render modes it appears in; every mode the case runs in when absent. */
  modes?: Array<'plain' | 'registry'>

  /**
   * The engines it appears in; every engine when absent. Elsewhere it neither
   * excuses a difference nor has to appear, for a difference whose values are
   * the engine's own (a layout length one engine computes differently).
   */
  engines?: Array<'chromium' | 'webkit' | 'firefox'>
  /** Its dimension, from compare.mjs. */
  dimension: string
  /** Text every matching difference report contains. */
  text: string

  /**
   * The tie this difference shows, when it blocks a release rather than being
   * accepted: the run excuses it, lists it as a release blocker, and fails if
   * it stops appearing, so a fix shows and the pin comes out.
   */
  blocker?: string
}
