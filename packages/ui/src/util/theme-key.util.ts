/**
 * Theme tokens where CSS needs a concrete value: a `css` key — an at-rule
 * condition or a selector — or the prelude of a block inside CSS text.
 *
 * `var()` is invalid in a condition or a selector, so such a token has to become
 * the theme's value itself. A key token is `theme.` followed by a path, and not
 * part of a name: in `'& .theme.accent'` it belongs to the class `.theme.accent`,
 * and in `'& #theme.accent'` to the id `#theme`, and is not a token. Written
 * without a lookbehind, which older browsers reject at parse time.
 */
const KEY_TOKEN = /(^|[^\w.#$-])theme\.([a-zA-Z0-9_.-]+)/g

/**
 * Whether the position `index` in CSS text is inside a prelude or a selector:
 * the next `{`, `;` or `}` after it is `{`. A declaration value ends at `;` or
 * `}` instead.
 */
export const isInPrelude = (text: string, index: number): boolean => {
  for (let i = index; i < text.length; i++) {
    const char = text[i]
    if (char === '{') return true
    if (char === ';' || char === '}') return false
  }
  return false
}

/** Whether a `css` key holds a theme token. */
export const keyHasThemeToken = (key: string): boolean => {
  KEY_TOKEN.lastIndex = 0
  return KEY_TOKEN.test(key)
}

/** Whether CSS text holds a theme token in a prelude or a selector. */
export const textHasThemeTokenInPrelude = (text: string): boolean => {
  if (!text.includes('theme.')) return false
  KEY_TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = KEY_TOKEN.exec(text)) !== null) {
    if (isInPrelude(text, match.index + match[1].length)) return true
  }
  return false
}

/**
 * Replaces each key token with `resolve(path)`, keeping any it cannot resolve.
 * @param text A key, or CSS text when `preludesOnly` is set.
 * @param resolve The theme's concrete value at a path, or `undefined`.
 * @param preludesOnly Touch only tokens in a prelude or a selector of CSS text.
 * @returns The rewritten text, or `text` itself when nothing changed.
 */
export const replaceKeyTokens = (text: string, resolve: (path: string) => string | undefined, preludesOnly = false): string => {
  if (!text.includes('theme.')) return text
  let changed = false
  KEY_TOKEN.lastIndex = 0
  const next = text.replace(KEY_TOKEN, (match, before: string, path: string, offset: number) => {
    if (preludesOnly && !isInPrelude(text, offset + before.length)) return match
    const value = resolve(path)
    if (value === undefined) return match
    changed = true
    return `${before}${value}`
  })
  return changed ? next : text
}

/**
 * Removes from CSS text every block whose prelude still holds a theme token, and
 * reports each prelude. The rest of the text is kept as written.
 * @param text CSS text.
 * @param report Called with each prelude removed.
 * @returns The text without those blocks, or `text` itself when there are none.
 */
export const removeBlocksWithThemeTokens = (text: string, report: (prelude: string) => void): string => {
  let result = text
  for (;;) {
    KEY_TOKEN.lastIndex = 0
    let match: RegExpExecArray | null
    let found = -1
    while ((match = KEY_TOKEN.exec(result)) !== null) {
      const at = match.index + match[1].length
      if (isInPrelude(result, at)) {
        found = at
        break
      }
    }
    if (found < 0) return result
    let start = found
    while (start > 0 && !'{};'.includes(result[start - 1])) start--
    const open = result.indexOf('{', found)
    let depth = 0
    let end = open
    for (; end < result.length; end++) {
      if (result[end] === '{') depth++
      else if (result[end] === '}' && --depth === 0) break
    }
    report(result.slice(start, open).trim())
    result = result.slice(0, start) + result.slice(Math.min(end + 1, result.length))
  }
}
