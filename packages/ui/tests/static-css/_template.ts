import { serializeStyles } from '@emotion/serialize'
import { registerStaticTemplate, toCssValue } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'

/** The text the runtime serializes for `css`, which the compiler computes. */
export function serializedTextOf(css: Record<string, unknown>): string {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  return nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never)).styles
}

/**
 * Props for a node of `css` whose `holes` keys hold values known only at run
 * time, as the compiler emits it: the text around the values registered as a
 * template, and the values as `toCssValue` writes them.
 */
export function templated(css: Record<string, unknown>, holes: readonly string[]): Record<string, unknown> {
  const text = serializedTextOf(css)
  const values = holes.map(key => toCssValue(key, css[key])!)
  const chunks: string[] = []
  let rest = text
  for (const value of values) {
    const at = rest.indexOf(value)
    chunks.push(rest.slice(0, at))
    rest = rest.slice(at + value.length)
  }
  chunks.push(rest)
  const id = `t-${holes.join('-')}-${chunks.map(chunk => chunk.length).join('.')}`
  registerStaticTemplate(id, chunks)
  return { __meo$: 2, __meo$t: [id, ...values] }
}
