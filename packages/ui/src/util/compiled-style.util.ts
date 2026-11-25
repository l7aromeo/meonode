import type { ThemeContextState } from '@src/components/theme-provider.client.js'
import type { Theme } from '@src/types/node.type.js'
import { compiledStyles, type CompiledStyle } from '@src/util/named-runtime-slot.util.js'
import { diagnosticsEnabled } from '@src/constant/common.const.js'
import { reportUnresolvedThemeKey } from '@src/util/diagnostics.util.js'
import { withNamedDiagnostics } from '@src/util/named-diagnostics.util.js'
import { textHasThemeTokenInPrelude } from '@src/util/theme-key.util.js'
import { resolveThemedText } from '@src/util/theme-value.util.js'
import { themedTexts } from '@src/util/themed-text-slot.util.js'

// How `StyledRenderer` renders a compiled style it is handed in place of css.
// Installed with the named runtime, when compiled output registers a style or
// `CompiledStyledRenderer` renders: the element a server component hands a
// client reference, whose browser may register none. An app without the
// compiler reaches neither, so it loads none of this.

/**
 * A compiled style for the theme the element renders under, as it goes to
 * Emotion: as the compiler serialized it, or, where a condition in it holds a
 * theme token, resolved for that theme. The resolver a registered style
 * installs keeps each resolution (see `themed-text.util.ts`); with none, it
 * resolves every time. In development, its theme variables are reported against
 * the theme in scope, as `StyledRenderer` reports css's.
 * @param compiled The compiled style.
 * @param theme The theme in scope.
 * @param context The theme context.
 * @returns The style to render.
 */
function resolveCompiled(compiled: CompiledStyle, theme: Theme | undefined, context: ThemeContextState | null): CompiledStyle {
  const report = diagnosticsEnabled() ? reportUnresolvedThemeKey : undefined
  const resolver = themedTexts.resolver
  let style = compiled
  if (resolver !== undefined) style = resolver.forRender(compiled.styles, theme, report) ?? compiled
  else if (textHasThemeTokenInPrelude(compiled.styles)) {
    const themed = resolveThemedText(compiled.styles, theme)
    if (report !== undefined) for (const prelude of themed.dropped) report(prelude)
    style = themed
  }
  if (report !== undefined) {
    const { styles } = style
    withNamedDiagnostics(d => d.checkNamedStyles(styles, context))
  }
  return style
}

/** Gives {@link compiledStyles} this module's resolution. */
export function installCompiledStyles(): void {
  compiledStyles.resolve ??= resolveCompiled
}
