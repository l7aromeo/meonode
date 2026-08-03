// Fixture: theme-tokens-in-keys
//
// Guards the boundary of the build-time `theme.*` -> `var(--meonode-theme-*)`
// rewrite (see `theme.rs` / `partition::rewrite_theme_tokens_in_buckets` and
// `partition::rewrite_theme_tokens_in_css_object`).
//
// The rewrite may only touch **values**. A theme token sitting in an object
// *key* must survive untouched, because CSS variables are invalid inside
// media-feature and selector text — `@media (max-width: var(--x))` simply does
// not match. `@meonode/ui` resolves such keys to concrete values at runtime via
// `ThemeUtil.resolveObjWithTheme`, which holds the live theme, and documents
// that same values-only invariant on `replaceThemeTokensWithCssVars`.
//
// The invariant used to hold structurally — media queries and pseudo-selectors
// live inside a `css:` block, `css` is a special key, and special keys were
// never walked at all. Since v0.5 the rewrite does recurse into `css` values, so
// the invariant is now enforced by the walker rather than by its absence, and
// this fixture is what proves it: on the real docs site every one of the 19
// media-query theme tokens is inside a `css:` block, and a rewrite that reached
// one of those keys would show up here as diverging HTML rather than as silently
// dead responsive styles in production.
//
// The `css:` block below therefore covers the nesting rules too: a value under a
// media-query key (property back in scope one level down), a value under a
// pseudo-selector, and a length property inside both.
//
// Also covers two value cases worth pinning:
//   - a token embedded in a shorthand value ('1px solid theme.base.deep'),
//     which must be rewritten in place rather than wholesale-replaced
//   - `theme.mode`, which names something outside `theme.system`. Since
//     `buildThemeVariablesCss` only walks `theme.system`, no `:root` rule ever
//     defines `--meonode-theme-mode`. Both variants must be equally undefined:
//     the point is that compiling changes nothing, not that the reference works.
import { Div, ThemeProvider } from '@meonode/ui'
import type { Theme } from '@meonode/ui'

const theme: Theme = {
  mode: 'light',
  system: {
    base: { default: '#ffffff', deep: '#0b1724', content: '#111827' },
    primary: { default: '#4f46e5', content: '#ffffff' },
    spacing: { sm: '8px', md: '16px' },
    breakpoint: { md: '768px' },
  },
}

export default function ThemeTokensInKeys() {
  return ThemeProvider({
    theme,
    children: Div({
      // Bucketed values: all of these must come out as var() references.
      padding: 'theme.spacing.md',
      gap: 'theme.spacing.sm',
      color: 'theme.base.content',
      border: '1px solid theme.base.deep',
      // Names nothing under theme.system — must still compile to the same
      // (undefined) var reference the runtime would have produced.
      content: 'theme.mode',
      // A DOM attribute, not a CSS property: lands in the `d` bucket. The
      // runtime converts tokens in elementProps too, so compiled and
      // uncompiled must agree here as well.
      'data-token': 'theme.primary',
      // Special key: never bucketed, but its values are rewritten in place.
      // The media-query *key* keeps its raw token and is resolved concretely at
      // runtime; only then does the breakpoint actually match.
      css: {
        backgroundColor: 'theme.base',
        '@media (max-width: theme.breakpoint.md)': {
          // `padding` takes a length, and it is in scope again one level below
          // the at-rule — so this must reference the `--len` variant, exactly
          // as the same declaration would at the top level.
          padding: 'theme.spacing.sm',
          color: 'theme.primary.content',
        },
        '&:hover': {
          backgroundColor: 'theme.primary',
          margin: 'theme.spacing.md',
        },
        // Arrays are left to the runtime: @meonode/ui's two conversion paths
        // disagree about *strings* inside them, so compiling must not pick a
        // side. The rewrite skips the array wholesale, which means the object
        // nested in it is converted at runtime like it always was — and both
        // variants must still agree.
        '&:active': [{ margin: 'theme.spacing.sm' }],
      },
      children: 'Themed box with responsive rules',
    }),
  })
}
