// Planted failures: one wrong rule, attribute or text per comparison dimension,
// applied to the compared side only. A dimension counts only after its plant
// has been caught, so `run.mjs --plants` must report every one of them.
//
// They all target PLANT_CASE, whose root element is a <section> holding the
// text "Plant target", a toggle that sets aria-pressed, an element marked for
// exact markup, a checkbox, a field with a placeholder, and a breakpoint at
// 600px.
//
// afterCrossing runs its listener in the page, so it uses its globals.
/* global Element */

/** The corpus case the plants are applied to. */
export const PLANT_CASE = 'plant-target'
/** The case's root element, as the plants select it. */
const ROOT = '#root > section'
/** A declaration no case sets, so a plant never coincides with a real style. */
const WRONG = 'outline-offset: 7px !important'

const addRule = css => page => page.addStyleTag({ content: css })

/** Adds a rule on the first load it is applied to and every other one after, so the planted page varies across loads. */
function everyOtherLoad(css) {
  let loads = 0
  return page => (loads++ % 2 === 0 ? page.addStyleTag({ content: css }) : undefined)
}

/**
 * Adds a rule once the pointer has crossed `n` elements of the case in one
 * session, so the page differs only inside a session whose pointer has moved
 * over earlier elements: the sweep reproduces it, a fresh load that reads one
 * state alone never does.
 */
function afterCrossing(n, css) {
  return page =>
    page.evaluate(
      ([n, css]) => {
        const crossed = new Set()
        document.addEventListener(
          'pointerover',
          event => {
            if (!(event.target instanceof Element) || !event.target.closest('#root') || crossed.size >= n) return
            crossed.add(event.target)
            if (crossed.size === n) document.head.append(Object.assign(document.createElement('style'), { textContent: css }))
          },
          true,
        )
      },
      [n, css],
    )
}

/** Elements the pointer crosses before the in-session plant takes effect: more than a fresh load's single read crosses. */
const CROSSED_BEFORE_PLANT = 3

/**
 * The registry check's plants (run.mjs, compareModes): each changes the
 * registry's server styles in the head of a [registry] page, alike on the
 * oracle and the "off" side, so their own row reads the same and only the
 * comparison with the runtime's [plain] render can see it. `head` rewrites
 * the page's head HTML.
 */
export const MODE_PLANTS = [
  // An unclosed `(` ahead of the registry's joined styles swallows every rule after it, as one key's could.
  {
    name: 'an unclosed ( ahead of the joined registry styles',
    dimension: 'computed',
    head: head => head.replace(/(<style data-emotion="meonode-css[^"]*"[^>]*>)/, '$1.parity-plant:not(.a{}'),
  },
]

/**
 * Plants in the compiler's output rather than on the page: each rewrites the
 * "on" side's compiled module of one case (and the parts it imports), and
 * the run must find a difference from the oracle that the unrewritten output
 * does not have; in `dimension`, when the plant names one.
 */
export const COMPILED_PLANTS = [
  {
    name: 'selector lists lose their product',
    case: 'selectors-nested',
    // Keeps the first selector of every nested list in the registered rule text.
    rewrite: code => code.replace(/(&[^,{}"()]*), [^{}"()]*\{/g, '$1{'),
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
    rewrite: code => code.replaceAll('@starting-style{', '@starting-style-x{'),
  },
  {
    name: 'the inner layer written into the outer one',
    case: 'layers-hydrate',
    // One layer for both rules, so specificity decides the tie instead of layer order.
    rewrite: code => code.replaceAll('@layer b{', '@layer a{'),
  },
  {
    name: 'a property inside an at-rule written prefixed only',
    case: 'atrule-shapes-hydrate',
    // Vendor pairs must come through the prefixer, so the rule text must show this in every engine.
    dimension: 'rule-text',
    // The registered text is unprefixed and the runtime prefixes it; written prefixed, the unprefixed half is
    // lost. An engine that honours the prefixed property styles the element the same, so there only the rule
    // text shows it.
    rewrite: code => code.replaceAll('@media (min-width: 1px){user-select:none;', '@media (min-width: 1px){-webkit-user-select:none;'),
  },
  {
    name: '@property registration lost',
    case: 'atrule-shapes-hydrate',
    // Unregistered, the custom property inherits, so the child reads the parent's length.
    rewrite: code => code.replaceAll('@property --parity-length{', '@property --parity-lost{'),
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
    rewrite: code => code.replaceAll('rotate:50deg;', 'rotate:60deg;'),
  },
  {
    name: 'a grammar page writes :hover as :active',
    case: 'generated/grammar-001',
    // Only a forced state on a grammar fixture can show this.
    rewrite: code => code.replaceAll(':hover{', ':active{'),
  },
  {
    name: 'an extracted ::selection rule dropped',
    case: 'selectors-ties',
    // The page's only ::selection rule: without it the side reads no ::selection, which must still show against the oracle's.
    dimension: 'pseudo-element',
    rewrite: code => code.replace(/&::selection\{[^{}"]*\}/, ''),
  },
  {
    name: 'the carrier marks stripped (host-toggle)',
    case: 'identity-host-toggle',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
  },
  {
    name: 'the carrier marks stripped (factory-toggle)',
    case: 'identity-factory-toggle',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
  },
  {
    name: 'the carrier marks stripped (host-reorder)',
    case: 'identity-host-reorder',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
  },
  {
    name: 'the carrier marks stripped (host-list)',
    case: 'identity-host-list',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
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
 * have one per pseudo-class, so each way of forcing one is proven. `confirm`
 * names the outcome a forced-state plant must reach under real input:
 * `stable` (the same in every sweep), `only-compared` (varying on the planted
 * page alone) or `in-session` (in every sweep and on no fresh load); each
 * stays a failure. `input` marks a plant only real input can set off: where
 * states are forced through the DevTools protocol no pointer moves, so it is
 * skipped there.
 */
export const PLANTS = [
  { dimension: 'computed', page: addRule(`${ROOT} { ${WRONG} }`) },
  { dimension: 'pseudo-element', page: addRule(`${ROOT}::after { content: "planted" }`) },
  { dimension: 'forced-state', name: ':hover', page: addRule(`${ROOT}:hover { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':focus', page: addRule(`${ROOT} button:focus { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':focus-visible', page: addRule(`${ROOT} button:focus-visible { ${WRONG} }`) },
  // Read only once the transition has run its course.
  {
    dimension: 'forced-state',
    name: ':hover after a transition',
    page: addRule(`${ROOT} { transition: outline-offset 2s linear } ${ROOT}:hover { ${WRONG} }`),
  },
  { dimension: 'forced-state', name: ':checked', page: addRule(`${ROOT} input:checked { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':disabled', page: addRule(`${ROOT} input:disabled { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':placeholder-shown', page: addRule(`${ROOT} input:not(:placeholder-shown) { ${WRONG} }`) },
  { dimension: 'forced-state', name: ':active', page: addRule(`${ROOT} button:active { ${WRONG} }`) },
  // Under real input a forced-state difference is read again on fresh loads (run.mjs, confirmForced). These two
  // must come through it as a failure: one the planted page shows on every load, and one it shows on alternate
  // loads only, which the oracle and the unplanted "off" side never show and so cannot excuse.
  { dimension: 'forced-state', name: 'a difference on every load, confirmed', confirm: 'stable', page: addRule(`${ROOT}:hover { ${WRONG} }`) },
  {
    dimension: 'forced-state',
    name: 'a difference on alternate loads of the planted page only',
    confirm: 'only-compared',
    page: everyOtherLoad(`${ROOT}:hover { ${WRONG} }`),
  },
  // A difference only inside a session whose pointer has crossed earlier elements: the repeated sweeps must confirm it,
  // and the fresh-load reads alone, each of which hovers a single element, must not see it.
  {
    dimension: 'forced-state',
    name: 'a difference only after the pointer has crossed earlier elements',
    confirm: 'in-session',
    input: true,
    page: afterCrossing(CROSSED_BEFORE_PLANT, `${ROOT} :hover, ${ROOT}:hover { ${WRONG} }`),
  },
  { dimension: 'breakpoint', page: addRule(`@media (min-width: 601px) and (max-width: 601px) { ${ROOT} { ${WRONG} } }`) },
  { dimension: 'color-scheme', page: addRule(`@media (prefers-color-scheme: dark) { ${ROOT} { ${WRONG} } }`) },
  { dimension: 'theme-mode', page: addRule(`[data-theme="dark"] ${ROOT} { ${WRONG} }`) },
  { dimension: 'state-step', page: addRule(`${ROOT} [aria-pressed="true"] { ${WRONG} }`) },
  // The step's click remounts one element: a fresh copy in its place, equal in tree and styles, as a lost identity is.
  {
    dimension: 'identity',
    page: page =>
      page.evaluate(root => {
        const target = document.querySelector(`${root} [data-parity-exact]`)
        document.querySelector(`${root} [data-act="toggle"]`).addEventListener('click', () => target.replaceWith(target.cloneNode(true)))
      }, ROOT),
  },
  // The same extracted-class rule twice in the page's stylesheets.
  {
    dimension: 'duplicate-rule',
    page: async page => {
      for (let i = 0; i < 2; i++) await page.addStyleTag({ content: `${ROOT} .mn-planted { ${WRONG} }` })
    },
  },
  // Only the server HTML read before hydration carries it.
  { dimension: 'first-paint', firstPaint: addRule(`${ROOT} { ${WRONG} }`) },
  {
    dimension: 'exact-markup',
    page: page => page.evaluate(root => document.querySelector(`${root} [data-parity-exact]`).classList.add('planted-exact'), ROOT),
  },
  { dimension: 'tree', page: page => page.evaluate(root => document.querySelector(root).setAttribute('data-planted', ''), ROOT) },
  { dimension: 'console', page: page => page.evaluate(() => console.error('planted error')) },
  // A server text the client does not render: React reports the mismatch, and the server HTML differs.
  { dimension: 'hydration', html: body => body.replace('Plant target', 'Plant targe') },
  { dimension: 'ssr-html', html: body => body.replace('Plant target', 'Plant targe') },
]
