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

/** Where the body finds its configuration, and how it finds its own element. */
const CONFIG_ATTRIBUTE = 'data-meonode-theme'

/** The preference that means "follow the OS" rather than naming a mode. */
const SYSTEM_PREFERENCE = 'system'

/**
 * What a mode name, a storage key and a system value are allowed to contain.
 *
 * Nothing in this library interpolates a mode into anything that parses it —
 * the theme variables are built from tokens, and every use of the attribute
 * goes through `setAttribute`, which is not a sink. The restriction is for the
 * application's sake: a mode name is the one value that crosses from this
 * configuration into CSS the application writes by hand, as
 * `[data-theme="…"]`, and a name carrying a quote or a bracket closes that
 * selector.
 */
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Describes the reader's stored preference to the pre-paint script.
 *
 * The field names match the mode-aware provider's, minus the parts only React
 * needs, so one object can be spread into both and the two cannot drift:
 *
 * ```ts
 * const theme = { modes: ['morning', 'night'], defaultMode: 'morning', system: { light: 'morning', dark: 'night' } } as const
 * themeScript(theme)
 * ThemeModesProvider({ ...theme, tokens, children })
 * ```
 */
export interface ThemeScriptConfig {
  /** Every mode name the application declares. A stored value outside this list is discarded. */
  modes: readonly ThemeMode[]
  /** The mode to stamp when nothing usable is stored. Must be one of `modes`. */
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
 * The whole script, and the same bytes for every application.
 *
 * Nothing an application names appears here. The configuration arrives in a
 * `data-` attribute and is parsed back out at run time, which is why this is a
 * constant: an interpolated body would need its own CSP hash per application,
 * and a new one every time somebody renamed a mode. It also puts script
 * injection out of reach rather than defending against it — there is no context
 * for a mode name to escape from, because it is never in source.
 *
 * Read the failure paths as the point rather than as noise:
 *
 * - `localStorage` throws on *property access*, not just from `getItem`, where
 *   site data is blocked and in a sandboxed iframe without `allow-same-origin`.
 *   One `try` around everything would leave those readers with no attribute at
 *   all, and a page with no `data-theme` is unstyled rather than merely in the
 *   wrong mode.
 * - `matchMedia` is missing in older WebViews and throws in some embedded ones.
 *   It is guarded separately so losing the answer costs the OS preference and
 *   not the attribute; the fallback is the light name, which is what the
 *   provider falls back to as well.
 * - `system` with no mapping resolves to the default. Stamping the word
 *   `system` would leave every `[data-theme="…"]` selector unmatched.
 * - The attributes are written only when the value is a string, so a truncated
 *   configuration cannot produce `data-theme="undefined"`.
 *
 * Because every one of those paths can end with no attribute written, an
 * application's CSS has to carry a usable palette at `:root` with
 * `[data-theme="…"]` blocks as overrides — not palettes that exist only under
 * the attribute.
 */
const THEME_SCRIPT_BODY = [
  '(function(){',
  'try{',
  // `currentScript` is the element being executed, which is this one. The
  // selector is the fallback for a body that did not arrive by parser, and
  // `getAttribute` rather than `dataset` sidesteps the camelCase mapping.
  `var s=document.currentScript||document.querySelector('script[${CONFIG_ATTRIBUTE}]');`,
  'if(!s)return;',
  `var c=JSON.parse(s.getAttribute('${CONFIG_ATTRIBUTE}'));`,
  'var m=c.modes||[],d=c.default,p=d;',
  "try{var v=localStorage.getItem(c.storageKey);if(typeof v==='string'&&v)p=v;}catch(x){}",
  `if(p!=='${SYSTEM_PREFERENCE}'&&m.indexOf(p)<0)p=d;`,
  'var t=p;',
  `if(p==='${SYSTEM_PREFERENCE}'){`,
  'var y=c.system;',
  "if(y){t=y.light;try{if(matchMedia('(prefers-color-scheme: dark)').matches)t=y.dark;}catch(x){}}",
  'else{p=d;t=d;}',
  '}',
  'var r=document.documentElement;',
  `if(r&&typeof t==='string')r.setAttribute('${MODE_ATTRIBUTE}',t);`,
  `if(r&&typeof p==='string')r.setAttribute('${PREFERENCE_ATTRIBUTE}',p);`,
  '}catch(x){}',
  '})();',
].join('')

/**
 * The `script-src` source expression for {@link themeScript}'s body.
 *
 * Under a hash-only Content Security Policy the header has to name the script
 * before the request that carries it, so the value has to be available without
 * rendering anything. It is a literal rather than a digest computed here: a
 * `crypto` call would need an async, platform-specific API on a path that has
 * neither, and the body it covers is fixed at build time anyway.
 *
 * The constant is checked against the digest of the body it claims to cover in
 * the test suite, so the two cannot drift apart. Taking it from here rather than
 * re-deriving it from rendered output is what keeps a consumer's policy correct
 * across upgrades — a hand-copied digest goes stale the day the body changes,
 * and the only symptom is a browser refusing to run the script.
 *
 * ```ts
 * headers.set('Content-Security-Policy', `script-src 'self' '${THEME_SCRIPT_CSP_HASH}'`)
 * ```
 */
export const THEME_SCRIPT_CSP_HASH = 'sha256-VjgrRIgkoFbiLcbmoxDfbf+5fL7BpGm+w6cKK2N2um4='

/** Names the failing field, because the message is the only place this surfaces. */
function assertSafeName(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_NAME.test(value)) {
    throw new Error(
      `themeScript: ${field} is ${JSON.stringify(value)}, which is not a usable name. ` +
        `Use letters, digits, \`-\` or \`_\`, up to 64 characters — an application writes these into \`[${MODE_ATTRIBUTE}="…"]\` selectors by hand.`,
    )
  }
}

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
 * Place it first in `<head>`, ahead of any stylesheet: a script that follows a
 * `<link rel="stylesheet">` cannot run until that sheet has loaded, which is
 * the delay this exists to avoid. The element it writes to needs
 * `suppressHydrationWarning`, since the attribute is not in the server markup.
 *
 * A configuration that cannot work throws here rather than emitting a script
 * that stamps a mode nothing matches. That failure is invisible to the
 * developer and reaches the reader as an unstyled page, and the configuration
 * is authored rather than data, so the check is deterministic and is not gated
 * on diagnostics — a check that fired in development only would let CI pass and
 * production ship the broken page.
 * @param config The application's mode names, its default, and optionally what the OS's two words mean here.
 * @returns A plain inline `<script>` node to place first in `<head>`.
 */
export function themeScript(config: ThemeScriptConfig): NodeInstance<'script'> {
  const { modes, defaultMode, system, storageKey = 'theme' } = config

  if (!Array.isArray(modes) || modes.length === 0) {
    throw new Error("themeScript: `modes` is empty, so there is no mode to apply. List the names the application declares, for example `['light', 'dark']`.")
  }
  for (const mode of modes) {
    assertSafeName(mode, '`modes` contains a name that')
    if (mode === SYSTEM_PREFERENCE) {
      throw new Error(
        `themeScript: \`modes\` contains "${SYSTEM_PREFERENCE}", which is the word a preference already uses for "follow the OS". A mode cannot also be called that.`,
      )
    }
  }
  assertSafeName(storageKey, '`storageKey`')
  if (!modes.includes(defaultMode)) {
    throw new Error(
      `themeScript: \`defaultMode\` is ${JSON.stringify(defaultMode)}, which is not one of \`modes\` (${modes.map(mode => JSON.stringify(mode)).join(', ')}). ` +
        'It is what every failure path falls back to, so it has to name a mode the stylesheets define.',
    )
  }
  if (system) {
    for (const word of ['light', 'dark'] as const) {
      if (!modes.includes(system[word])) {
        throw new Error(
          `themeScript: \`system.${word}\` is ${JSON.stringify(system[word])}, which is not one of \`modes\` (${modes.map(mode => JSON.stringify(mode)).join(', ')}). ` +
            "The mapping says which of this application's modes the OS means, so both sides of it have to be modes.",
        )
      }
    }
  }

  // Written key by key in a fixed sequence rather than stringifying the config.
  // `JSON.stringify` follows insertion order, so a configuration object
  // assembled one way on the server and another on the client would produce a
  // different attribute and a hydration mismatch.
  const payload: Record<string, unknown> = { modes: [...modes], default: defaultMode }
  if (system) payload.system = { light: system.light, dark: system.dark }
  payload.storageKey = storageKey

  // Deliberately a plain inline script with no `src`. A `src` would make this a
  // resource React hoists and may defer, which moves it out of the window the
  // whole design depends on. `dangerouslySetInnerHTML` rather than a text
  // child, because React runs text children of `<script>` through its own
  // escaper and an escaper that changed between versions would change the CSP
  // hash of a body that is otherwise fixed forever.
  return Script({ [CONFIG_ATTRIBUTE]: JSON.stringify(payload), dangerouslySetInnerHTML: { __html: THEME_SCRIPT_BODY } })
}
