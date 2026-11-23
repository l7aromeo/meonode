/** The characters a CSS rule's or statement's text ends with when a parser would start a new one after it. */
const RULE_ENDS = '};'

/**
 * Rule text that ends where a CSS statement can end, so a rule joined after it
 * starts a rule of its own.
 *
 * Stylis writes a nested `@import` (`css: { '@import url(x)': { … } }`) as the
 * statement `@import url(x)` with no `;`, as Emotion's production build keeps
 * it. Where the text ends, so does the statement, as in Emotion's own server
 * render, which gives each element's rules a `<style>` of their own. Joined to
 * more text, by MeoNode or by React (`<style href precedence>` texts of one
 * precedence go out as one element), the statement runs on to the next rule's
 * block and every browser drops that rule with it. The `;` ends it alone; the
 * statement stays as Emotion wrote it, and a browser ignores it as before.
 * @param text One style's rules, as Emotion's cache writes them.
 * @returns The text, with a `;` after a last statement left open.
 */
export function terminateRules(text: string): string {
  return text === '' || RULE_ENDS.includes(text[text.length - 1]!) ? text : `${text};`
}

/** The character a CSS parser closes each block it opens with. */
const CLOSERS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' }

/** Whether `code` can be part of an identifier, as CSS tokenizing reads one: a letter, digit, `-`, `_` or non-ASCII. */
function isNameCode(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 45 || code === 95 || code >= 128
}

/** Whether `code` is CSS whitespace. */
function isSpaceCode(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13
}

/**
 * Whether the `(` at `at` in `text` starts a `url(` with an unquoted body, which
 * CSS tokenizing reads as one token, `(` and all, up to its `)`.
 */
function startsUrlToken(text: string, at: number): boolean {
  if (at < 3 || text.slice(at - 3, at).toLowerCase() !== 'url' || (at > 3 && (isNameCode(text.charCodeAt(at - 4)) || text[at - 5] === '\\'))) return false
  let next = at + 1
  while (next < text.length && isSpaceCode(text.charCodeAt(next))) next++
  return text[next] !== '"' && text[next] !== "'"
}

/**
 * Whether `text` leaves a block, string, comment or `url(` open at its end, as a
 * browser's CSS tokenizer reads it. Whatever follows it in the same sheet then
 * goes into that construct, past any `}` or `;`, and is lost with it.
 *
 * Stylis keeps a key with an unclosed `(` (`'&:not(.a'`) as text that leaves the
 * `(` open. In a `<style>` of its own, as in Emotion's server render, the sheet
 * ends there and nothing else is lost; a rule joined after it is.
 * @param text One style's rules, as Emotion's cache writes them.
 * @returns Whether a rule after it in the same sheet would be read into it.
 */
export function leavesOpen(text: string): boolean {
  const open: string[] = []
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (char === '\\') {
      // An escape: the next character is part of a name, whatever it is.
      index++
    } else if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2)
      if (end === -1) return true
      index = end + 1
    } else if (char === '"' || char === "'") {
      for (index++; index < text.length && text[index] !== char; index++) {
        if (text[index] === '\\') index++
        // A newline ends a string unterminated, and the parser goes on after it.
        else if (text[index] === '\n') break
      }
      if (index >= text.length) return true
    } else if (char === '(' && startsUrlToken(text, index)) {
      for (index++; index < text.length && text[index] !== ')'; index++) if (text[index] === '\\') index++
      if (index >= text.length) return true
    } else if (char in CLOSERS) {
      open.push(CLOSERS[char]!)
    } else if (char === open[open.length - 1]) {
      open.pop()
    }
  }
  return open.length > 0
}

/**
 * Whether `text` starts with a statement a browser applies only at the start of a
 * sheet: an `@import`, which it ignores after any other rule. Emotion writes a
 * style with no declarations of its own, such as `css: '@import url(x);'`, as
 * that statement alone, and its server render gives it a `<style>` of its own,
 * where it applies.
 * @param text One style's rules, as Emotion's cache writes them.
 * @returns Whether the text must start a sheet to apply as it does on its own.
 */
export function needsSheetStart(text: string): boolean {
  return text.slice(0, 7).toLowerCase() === '@import'
}

/**
 * Where styles' rule texts, joined in order, must start a new `<style>` for each
 * to apply as it does in a `<style>` of its own: after a text that leaves a block
 * or string open ({@link leavesOpen}), and before one that must start a sheet
 * ({@link needsSheetStart}). Most runs need none, and go out as one element.
 * @param texts The styles' rule texts, in order.
 * @returns The index of the text each sheet starts with: `[0]` for one sheet.
 */
export function sheetStarts(texts: readonly string[]): number[] {
  const starts = [0]
  let empty = true
  for (let index = 0; index < texts.length; index++) {
    const text = texts[index]!
    if (!empty && needsSheetStart(text)) starts.push(index)
    if (leavesOpen(text) && index + 1 < texts.length) {
      starts.push(index + 1)
      empty = true
    } else empty = false
  }
  return starts
}
