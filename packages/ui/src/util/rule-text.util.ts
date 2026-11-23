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
