// Planted failures: one wrong rule, attribute or text per comparison dimension,
// applied to the compared side only. A dimension counts only after its plant
// has been caught, so `run.mjs --plants` must report every one of them.
//
// They all target PLANT_CASE, whose root element is a <section> holding the
// text "Plant target", a toggle that sets aria-pressed, an element marked for
// exact markup, a checkbox, a field with a placeholder, and a breakpoint at
// 600px.

/** The corpus case the plants are applied to. */
export const PLANT_CASE = 'plant-target'
/** The case's root element, as the plants select it. */
const ROOT = '#root > section'
/** A declaration no case sets, so a plant never coincides with a real style. */
const WRONG = 'outline-offset: 7px !important'

const addRule = css => page => page.addStyleTag({ content: css })

/**
 * Plants in the compiler's output rather than on the page: each rewrites the
 * "on" side's compiled module of one case, and the run must find a difference
 * from the oracle that the unrewritten output does not have.
 */
export const COMPILED_PLANTS = [
  {
    name: 'selector lists lose their product',
    case: 'selectors-nested',
    // Keeps the first selector of every extracted rule's list.
    rewrite: code => code.replace(/"(\.mn-[^"{,]*),[^"{]*\{/g, '"$1{'),
  },
  {
    name: ':not with a list inside keeps only its first item',
    case: 'selectors-not',
    // As a compiler that read :not( as a plain suffix would split its list.
    rewrite: code => code.replace(/:not\(([^,()]+),\s*[^()]+\)/g, ':not($1)'),
  },
  {
    name: 'a selector no engine renders, renamed',
    case: 'generated/selectors-01',
    // ::highlight() with no registered highlight styles nothing, so only the rule text can show this.
    rewrite: code => code.replaceAll('::highlight(parity)', '::highlight(parity-x)'),
  },
  {
    name: '@starting-style dropped',
    case: 'atrule-shapes-hydrate',
    // An at-rule name the engine does not know: only the sampled frame of the transition shows it.
    rewrite: code => code.replaceAll("'@starting-style'", "'@starting-style-x'"),
  },
  {
    name: 'the inner layer written into the outer one',
    case: 'layers-hydrate',
    // One layer for both rules, so specificity decides the tie instead of layer order.
    rewrite: code => code.replaceAll("'@layer b'", "'@layer a'"),
  },
  {
    name: 'a vendor-prefixed pair inside an at-rule loses its prefix',
    case: 'atrule-shapes-hydrate',
    // An engine that reads the unprefixed property styles the same, so only the rule text can show this.
    rewrite: code => code.replaceAll('-webkit-user-select:none;', ''),
  },
  {
    name: '@property registration lost',
    case: 'atrule-shapes-hydrate',
    // Unregistered, the custom property inherits, so the child reads the parent's length.
    rewrite: code => code.replaceAll("'@property --parity-length'", "'@property --parity-lost'"),
  },
  {
    name: 'an extracted animation loses its fill mode',
    case: 'atrule-shapes-hydrate',
    // Ended without forwards, the element falls back to its own opacity.
    rewrite: code => code.replaceAll('parity-grow 2s linear forwards', 'parity-grow 2s linear'),
  },
  {
    name: 'an extracted infinite animation changes its timing function',
    case: 'atrule-shapes-hydrate',
    // Paused partway through an iteration, ease-in and linear give different angles.
    rewrite: code => code.replaceAll('parity-turn 3s ease-in infinite', 'parity-turn 3s linear infinite'),
  },
  {
    name: 'a keyframe value of an infinite animation changes',
    case: 'atrule-shapes-hydrate',
    rewrite: code => code.replaceAll("rotate: '50deg'", "rotate: '60deg'"),
  },
  {
    name: 'a grammar page writes :hover as :active',
    case: 'generated/grammar-001',
    // Only a forced state on a grammar fixture can show this.
    rewrite: code => code.replaceAll(':hover{', ':active{'),
  },
  {
    name: 'a var() fallback dropped',
    case: 'custom-props-hydrate',
    // With no fallback the missing property makes the declaration invalid at computed time.
    rewrite: code => code.replaceAll('var(--parity-missing, 4px)', 'var(--parity-missing)'),
  },
]

/**
 * Each plant: its dimension, an optional name when a dimension has more than
 * one, and what it changes on the page or in the server HTML. Forced states
 * have one per pseudo-class, so each way of forcing one is proven.
 */
export const PLANTS = [
  { dimension: 'computed', page: addRule(`${ROOT} { ${WRONG} }`) },
  { dimension: 'pseudo-element', page: addRule(`${ROOT}::after { content: "planted" }`) },
  { dimension: 'forced-state', name: ':hover', page: addRule(`${ROOT}:hover { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':focus', page: addRule(`${ROOT} button:focus { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':focus-visible', page: addRule(`${ROOT} button:focus-visible { ${WRONG} }`) },
  // Read only once the transition has run its course.
  { dimension: 'forced-state', name: ':hover after a transition', page: addRule(`${ROOT} { transition: outline-offset 2s linear } ${ROOT}:hover { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':checked', page: addRule(`${ROOT} input:checked { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':disabled', page: addRule(`${ROOT} input:disabled { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':placeholder-shown', page: addRule(`${ROOT} input:not(:placeholder-shown) { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':active', page: addRule(`${ROOT} button:active { ${WRONG} }`) },
  { dimension: 'breakpoint', page: addRule(`@media (min-width: 601px) and (max-width: 601px) { ${ROOT} { ${WRONG} } }`) },
  { dimension: 'color-scheme', page: addRule(`@media (prefers-color-scheme: dark) { ${ROOT} { ${WRONG} } }`) },
  { dimension: 'theme-mode', page: addRule(`[data-theme="dark"] ${ROOT} { ${WRONG} }`) },
  { dimension: 'state-step', page: addRule(`${ROOT} [aria-pressed="true"] { ${WRONG} }`) },
  { dimension: 'exact-markup', page: page => page.evaluate(root => document.querySelector(`${root} [data-parity-exact]`).classList.add('planted-exact'), ROOT) },
  { dimension: 'tree', page: page => page.evaluate(root => document.querySelector(root).setAttribute('data-planted', ''), ROOT) },
  { dimension: 'console', page: page => page.evaluate(() => console.error('planted error')) },
  // A server text the client does not render: React reports the mismatch, and the server HTML differs.
  { dimension: 'hydration', html: body => body.replace('Plant target', 'Plant targe') },
  { dimension: 'ssr-html', html: body => body.replace('Plant target', 'Plant targe') },
]
