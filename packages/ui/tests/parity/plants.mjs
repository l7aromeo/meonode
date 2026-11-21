// Planted failures: one wrong rule, attribute or text per comparison dimension,
// applied to the compared side only. A dimension counts only after its plant
// has been caught, so `run.mjs --plants` must report every one of them.
//
// They all target PLANT_CASE, whose root element is a <section> holding the
// text "Plant target", a toggle that sets aria-pressed, and a breakpoint at 600px.

/** The corpus case the plants are applied to. */
export const PLANT_CASE = 'plant-target'
/** The case's root element, as the plants select it. */
const ROOT = '#root > section'
/** A declaration no case sets, so a plant never coincides with a real style. */
const WRONG = 'outline-offset: 7px !important'

const addRule = css => page => page.addStyleTag({ content: css })

/** Each plant: its dimension, and what it changes on the page or in the server HTML. */
export const PLANTS = [
  { dimension: 'computed', page: addRule(`${ROOT} { ${WRONG} }`) },
  { dimension: 'pseudo-element', page: addRule(`${ROOT}::after { content: "planted" }`) },
  { dimension: 'forced-state', page: addRule(`${ROOT}:hover { ${WRONG} }`) },
  { dimension: 'breakpoint', page: addRule(`@media (min-width: 601px) and (max-width: 601px) { ${ROOT} { ${WRONG} } }`) },
  { dimension: 'color-scheme', page: addRule(`@media (prefers-color-scheme: dark) { ${ROOT} { ${WRONG} } }`) },
  { dimension: 'theme-mode', page: addRule(`[data-theme="dark"] ${ROOT} { ${WRONG} }`) },
  { dimension: 'state-step', page: addRule(`${ROOT} [aria-pressed="true"] { ${WRONG} }`) },
  { dimension: 'tree', page: page => page.evaluate(root => document.querySelector(root).setAttribute('data-planted', ''), ROOT) },
  { dimension: 'console', page: page => page.evaluate(() => console.error('planted error')) },
  // A server text the client does not render: React reports the mismatch, and the server HTML differs.
  { dimension: 'hydration', html: body => body.replace('Plant target', 'Plant targe') },
  { dimension: 'ssr-html', html: body => body.replace('Plant target', 'Plant targe') },
]
