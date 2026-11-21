// @vitest-environment node
//
// `toCssValue` writes the value a compiled call site sets on a `--mv-*` variable.
// It has to be the text the runtime itself would have written for that css entry,
// so each case is checked against what Emotion serializes for the same entry.
import { serializeStyles } from '@emotion/serialize'
import { describe, expect, it } from 'vitest'
import { toCssValue } from '@src/main.js'
import { replaceThemeTokensInString } from '@src/util/server-theme.util.js'

/** The value Emotion writes for `property: value`, or `undefined` when it writes none. */
function emotionValue(property: string, value: unknown): string | undefined {
  const styles = serializeStyles([{ [property]: value } as never]).styles
  // Nothing, or for `null` an empty nested block: no declaration either way.
  if (!styles.includes(':')) return undefined
  const text = styles.slice(styles.indexOf(':') + 1, -1)
  // Emotion writes `prop:;` for an empty string, which the browser drops.
  return text === '' ? undefined : replaceThemeTokensInString(text, property)
}

const CASES: [string, unknown][] = [
  ['width', 8],
  ['width', 0],
  ['width', -2.5],
  ['width', '8'],
  ['width', '50%'],
  ['lineHeight', 1.5],
  ['line-height', 1.5],
  ['opacity', 0.4],
  ['zIndex', 3],
  ['flexGrow', 2],
  ['fontWeight', 700],
  ['WebkitLineClamp', 3],
  ['--custom', 4],
  ['padding', 'theme.spacing.md'],
  ['color', 'theme.colors.primary'],
  ['margin', 'calc(theme.spacing.md * 2)'],
  ['width', ''],
  ['width', null],
  ['width', undefined],
  ['width', true],
  ['width', false],
]

describe('a variable value', () => {
  it.each(CASES)('is what the runtime writes for %s: %j', (property, value) => {
    expect(toCssValue(property, value)).toBe(emotionValue(property, value))
  })

  it('gets px only where Emotion adds it', () => {
    expect(toCssValue('width', 8)).toBe('8px')
    expect(toCssValue('lineHeight', 1.5)).toBe('1.5')
    // Emotion's unitless table is keyed by the camelCase name, so the kebab one gets px.
    expect(toCssValue('line-height', 1.5)).toBe('1.5px')
    expect(toCssValue('--custom', 4)).toBe('4')
    expect(toCssValue('width', 0)).toBe('0')
  })

  it('takes a theme token as the runtime’s variable reference', () => {
    expect(toCssValue('color', 'theme.colors.primary')).toBe('var(--meonode-theme-colors-primary)')
  })

  it('is nothing for a value Emotion omits', () => {
    for (const value of [null, undefined, true, false, '', {}, [], () => 1]) expect(toCssValue('width', value)).toBeUndefined()
  })
})
