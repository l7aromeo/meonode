import { Script } from '@src/components/html.node.js'
import type { NodeInstance, ThemeMode } from '@src/types/node.type.js'

/**
 * Where the resolved mode is stamped. The provider seeds itself from this
 * attribute rather than from storage, so the two names have to be the same one;
 * it is a constant and not an option for that reason. An option would let an
 * application point the script at an attribute nothing reads, and the failure
 * would be a silent flash rather than an error.
 */
const MODE_ATTRIBUTE = 'data-theme'

/**
 * What the reader chose, which is not always the mode they see: `system` stays
 * `system` here. Written for stylesheets and for anything that wants to show a
 * three-way control in its current position before React has loaded.
 */
const PREFERENCE_ATTRIBUTE = 'data-theme-preference'

/** The preference that means "follow the OS" rather than naming a mode. */
const SYSTEM_PREFERENCE = 'system'

/**
 * Describes the reader's stored preference to the pre-paint script.
 *
 * The field names match the mode-aware provider's, minus the parts only React
 * needs, so one object can be spread into both and the two cannot drift:
 *
 * ```ts
 * const theme = { modes: ['morning', 'night'], defaultMode: 'morning', system: { light: 'morning', dark: 'night' } } as const
 * themeScript(theme)
 * ThemeProvider({ ...theme, tokens, children })
 * ```
 */
export interface ThemeScriptConfig {
  /** Every mode name the application declares. A stored value outside this list is discarded. */
  modes: readonly ThemeMode[]
  /** The mode to stamp when nothing usable is stored. */
  defaultMode: ThemeMode

  /**
   * Maps the two words `prefers-color-scheme` speaks onto two of `modes`.
   * Without it, `system` is not offered.
   *
   * Written out rather than named so the provider's own mapping type is
   * accepted by structure, and so neither side has to own a shared declaration.
   */
  system?: { light: ThemeMode; dark: ThemeMode }
  /** Where the preference is kept. Defaults to `theme`. */
  storageKey?: string
}

/**
 * Encodes a value as a JavaScript literal that is also safe as element content.
 *
 * `</script` inside a string literal still ends the element as far as the HTML
 * parser is concerned, and the remainder of the source becomes text in the
 * document. Escaping every `<` closes that without changing what the literal
 * evaluates to. Mode names come from the application rather than the reader, so
 * this is not a reader-facing hole — it is the difference between a typo and a
 * broken page.
 */
const literal = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

/**
 * Builds the pre-paint script for a mode-aware theme, as a node for `<head>`.
 *
 * The server renders one document for every reader, so nothing in it says which
 * mode to paint: token values are `var()` references and the palettes live in
 * CSS keyed by `[data-theme="…"]`. This script supplies the missing half in the
 * only window where the answer is still invisible — after the document element
 * exists, before the first paint — by reading the stored preference and stamping
 * the resolved mode on `<html>`. There is no flicker because there was never a
 * wrong first paint to correct.
 *
 * The source it emits is a pure function of `config`, byte for byte. That is not
 * tidiness: under a hash-only CSP the `script-src 'sha256-…'` is computed ahead
 * of the request, and a single byte of drift between that computation and the
 * rendered document makes the browser refuse to run the script — leaving the
 * page painted in the wrong mode with nothing able to correct it.
 *
 * A stored value that is not a declared mode is discarded rather than stamped,
 * because the provider discards it too; agreeing here is what keeps a reader
 * whose stored mode has since been renamed from seeing the attribute rewritten
 * after hydration.
 * @param config The application's mode names, its default, and optionally what the OS's two words mean here.
 * @returns A plain inline `<script>` node to place in `<head>`.
 */
export function themeScript(config: ThemeScriptConfig): NodeInstance<'script'> {
  const { modes, defaultMode, system, storageKey = 'theme' } = config

  const fallback = literal(defaultMode)
  // A preference that no longer names a mode is as unusable as no preference at
  // all. Without a mapping `system` is one of those: the media query answers in
  // the OS's words, and nothing has said what they mean here.
  const stored = system ? `if(p!==${literal(SYSTEM_PREFERENCE)}&&m.indexOf(p)<0)p=${fallback};` : `if(m.indexOf(p)<0)p=${fallback};`

  // Without a mapping the preference is already the mode, so nothing is
  // computed and nothing is stored to compute it into. This runs blocking in
  // `<head>`; every statement that does not have to be there is paid for on
  // every page load.
  const resolved = system
    ? `var t=p===${literal(SYSTEM_PREFERENCE)}?(matchMedia("(prefers-color-scheme: dark)").matches?${literal(system.dark)}:${literal(system.light)}):p;`
    : ''
  const mode = system ? 't' : 'p'

  // Storage throws outright in private mode and where site data is blocked, and
  // `matchMedia` is absent in some embedded webviews. Either one unhandled is an
  // uncaught error in a blocking script in `<head>`, which is the one place it
  // can stop the document. Bailing leaves the attribute unwritten and the
  // provider falls back to `defaultMode`, which is the pre-existing behaviour.
  const source =
    'try{' +
    `var m=${literal([...modes])},p=localStorage.getItem(${literal(storageKey)});` +
    stored +
    resolved +
    'var d=document.documentElement;' +
    `d.setAttribute(${literal(MODE_ATTRIBUTE)},${mode});` +
    `d.setAttribute(${literal(PREFERENCE_ATTRIBUTE)},p);` +
    '}catch(e){}'

  // Deliberately a plain inline script with no `src`. A `src` would make this a
  // resource React hoists and may defer, which moves it out of the window the
  // whole design depends on.
  return Script({ dangerouslySetInnerHTML: { __html: source } })
}
