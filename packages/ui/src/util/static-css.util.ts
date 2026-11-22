import { isDevMode } from '@src/constant/common.const.js'
import { getGlobalState } from '@src/helper/common.helper.js'

/**
 * The styles the compiler serialized at build time.
 *
 * Compiled output registers each module's styles once, at module evaluation,
 * with {@link registerStaticCss}, and each template with
 * {@link registerStaticTemplate}. That only records them. A named node's style
 * reaches the page through Emotion's own cache, under Emotion's name, when the
 * render inserts it: in the order Emotion would insert it, ahead of the next
 * rule of the render (see `BaseNode.render`).
 *
 * Everything kept is per module, per name or per template, so it is bounded by
 * the code that was built. Nothing is kept per render or per request.
 */

/** One extracted style: a node's whole style as Emotion serializes it, under the name `StyledRenderer` gives it. */
export type StaticCssRule = readonly [name: string, styles: string]

interface StaticCssState {
  /** Every registered whole style, its serialized text by its name. */
  named: Map<string, string>
  /** Every registered template: the text around its holes, by its id. */
  templates: Map<string, readonly string[]>
  /** Every registered module id. */
  modules: Set<string>
  /** Test seam: the registrations the loaded modules made, which a reset keeps. */
  baseline?: Registrations
}

/** What modules register: whole styles, templates, and which modules did. */
interface Registrations {
  named: Map<string, string>
  templates: Map<string, readonly string[]>
  modules: Set<string>
}

const state = getGlobalState(Symbol.for('@meonode/ui/staticCss'), (): StaticCssState => ({
  named: new Map(),
  templates: new Map(),
  modules: new Set(),
}))

/** Whether any whole style or template is registered. Until one is, a render looks for none. */
export const hasNamedStyles = (): boolean => state.named.size > 0 || state.templates.size > 0

/** The serialized text of a registered whole style, by its name, or `undefined` when none is registered. */
export const staticStylesOf = (name: string): string | undefined => state.named.get(name)

/**
 * The serialized text of a template with its holes filled, or `undefined` when
 * no template of that id is registered or `values` do not fill its holes.
 * @param id The template's id.
 * @param values Each hole's value text, in order.
 * @returns The text.
 */
export function templateText(id: string, values: readonly unknown[]): string | undefined {
  const chunks = state.templates.get(id)
  if (chunks === undefined || chunks.length !== values.length + 1) return undefined
  let text = chunks[0]
  for (let hole = 0; hole < values.length; hole++) {
    const value = values[hole]
    if (typeof value !== 'string') return undefined
    text += value + chunks[hole + 1]
  }
  return text
}

/**
 * Registers a module's extracted styles. Compiled output calls this once per
 * module, at its top level. Nothing reaches the page until a node using a name
 * renders.
 *
 * A name registered by an earlier module keeps that module's text: the same
 * node style in two modules is one name. One whose text differs from the one
 * already registered means two builds are mixed, and in development throws.
 * @param moduleId A hash of the module's styles, so the same styles register once.
 * @param rules The module's styles, each as `[name, styles]`.
 */
export function registerStaticCss(moduleId: string, rules: readonly StaticCssRule[]): void {
  if (state.modules.has(moduleId)) return
  for (const [name, styles] of rules) {
    const known = state.named.get(name)
    if (known === undefined) state.named.set(name, styles)
    else if (known !== styles && isDevMode()) {
      throw new Error(
        `[MeoNode] The static style \`${name}\` is registered with two different texts:\n  ${known}\n  ${styles}\nOutput of two different builds is loaded together.`,
      )
    }
  }
  state.modules.add(moduleId)
}

/**
 * Registers a template of a whole style: its serialized text around each hole a
 * call site fills with a value, at run time. Compiled output calls this once
 * per template, at its module's top level. The same id registered again keeps
 * its first text; one whose text differs means two builds are mixed, and in
 * development throws.
 * @param id A hash of the template's text.
 * @param chunks The text before the first hole, between each two, and after the last.
 */
export function registerStaticTemplate(id: string, chunks: readonly string[]): void {
  const known = state.templates.get(id)
  if (known === undefined) state.templates.set(id, chunks)
  else if (isDevMode() && (known.length !== chunks.length || known.some((chunk, index) => chunk !== chunks[index]))) {
    throw new Error(
      `[MeoNode] The static template \`${id}\` is registered with two different texts:\n  ${known.join('…')}\n  ${chunks.join('…')}\nOutput of two different builds is loaded together.`,
    )
  }
}

/**
 * Test seam: keeps what the loaded modules registered so far as the baseline a
 * reset returns to. A test file's own module, compiled, registers its styles as
 * it loads, once, as an app's module does; a reset between its tests must not
 * forget them.
 */
export function __markStaticCssBaseline(): void {
  state.baseline = { named: new Map(state.named), templates: new Map(state.templates), modules: new Set(state.modules) }
}

/** Test seam: forgets every registration since the baseline, all of them when none is marked. */
export function __resetStaticCss(): void {
  const baseline = state.baseline
  state.named = new Map(baseline?.named)
  state.templates = new Map(baseline?.templates)
  state.modules = new Set(baseline?.modules)
}
