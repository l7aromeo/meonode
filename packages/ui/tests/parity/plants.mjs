// Planted failures: one wrong rule, attribute or text per comparison dimension,
// applied to the compared side only. A dimension counts only after its plant
// has been caught, so `run.mjs --plants` must report every one of them.
//
// They all target PLANT_CASE, whose root element is a <section> holding the
// text "Plant target", a toggle that sets aria-pressed, an element marked for
// exact markup, a one-column multi-column box, a checkbox, a field with a
// placeholder that mounts a hint while it has focus, a box its own hover moves
// from under the pointer, a box whose centre lies inside its child, and a
// breakpoint at 600px.
//
// afterCrossing runs its listener in the page, so it uses its globals.
/* global Element */
import { NEUTRAL } from './collect.mjs'

/** The corpus case the plants are applied to. */
export const PLANT_CASE = 'plant-target'
/** The case's root element, as the plants select it. */
const ROOT = '#root > section'
/** A declaration no case sets, so a plant never coincides with a real style. */
const WRONG = 'outline-offset: 7px !important'

const addRule = css => page => page.addStyleTag({ content: css })

/**
 * Keeps the pointer where it is at the first reset after it has been on the
 * case's content, instead of moving it to the neutral square, so the element
 * under it still matches :hover there, as WebKit can leave an element after a
 * press (collect.mjs, withReload). Once per page, or with `again` once on
 * every load of it, its reload included.
 */
function stuckHover({ again }) {
  return page => {
    if (!again && page.parityStuckHover) return
    page.parityStuckHover = true
    const { move, down, up } = page.mouse
    let away = false
    let pressed = false
    let kept = false
    page.mouse.down = options => ((pressed = true), down.call(page.mouse, options))
    page.mouse.up = options => ((pressed = false), up.call(page.mouse, options))
    // Only a move off the content with no button held: the press's own release away from the element is no reset.
    page.mouse.move = async (x, y, options) => {
      const neutral = x === NEUTRAL[0] && y === NEUTRAL[1]
      if (neutral && away && !pressed && !kept) {
        kept = true
        return
      }
      away = !neutral
      return move.call(page.mouse, x, y, options)
    }
  }
}

/** Applies `plant` on the first load and every other one after, so the planted page varies across loads. */
function onAlternateLoads(plant) {
  let loads = 0
  return page => (loads++ % 2 === 0 ? plant(page) : undefined)
}

/** Adds a rule on the first load it is applied to and every other one after, so the planted page varies across loads. */
const everyOtherLoad = css => onAlternateLoads(addRule(css))

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
 * Adds a rule once a key has been pressed in the session: a sweep presses one
 * before each :focus-visible, while a fresh load reading only pointer states
 * of the planted page never does.
 */
function afterKeyPress(css) {
  return page =>
    page.evaluate(
      css =>
        document.addEventListener('keydown', () => document.head.append(Object.assign(document.createElement('style'), { textContent: css })), {
          capture: true,
          once: true,
        }),
      css,
    )
}

/**
 * Hides the children of the element `selector` matches from the pointer's
 * measure on the planted page: their boxes, and the hit test, which gives the
 * element where it would give a child. The plant target's inner box has its
 * centre inside its child, so the point the planted page picks there lies on
 * the child and the hover the pointer gets is the child's: the pointer there
 * must not settle.
 */
function pointBlindToChildren(selector) {
  return page =>
    page.evaluate(s => {
      const box = document.querySelector(s)
      const children = new Set(box.children)
      for (const child of children) child.getClientRects = () => []
      const hit = document.elementFromPoint.bind(document)
      document.elementFromPoint = (x, y) => {
        const found = hit(x, y)
        return children.has(found) ? box : found
      }
    }, selector)
}

/**
 * While the field has focus, once the pointer has crossed `n` elements of
 * the case in one session, mounts a span inside the multi-column box, ahead
 * of the checkbox, the field and the toggle in document order: DOM that an
 * earlier state left in the page shifts every later element's index, as a
 * button's exiting ripples do. It is positioned out of the flow, as those
 * are, so no other element's box changes with it.
 */
function mountAfterCrossing(n) {
  return page =>
    page.evaluate(
      ([root, n]) => {
        const crossed = new Set()
        document.addEventListener(
          'pointerover',
          event => {
            if (event.target instanceof Element && event.target.closest('#root') && crossed.size < n) crossed.add(event.target)
          },
          true,
        )
        const field = document.querySelector(`${root} input[placeholder]`)
        const left = Object.assign(document.createElement('span'), { textContent: 'left over' })
        left.style.position = 'absolute'
        field.addEventListener('focus', () => crossed.size >= n && document.querySelector(`${root} [data-parity-columns]`).append(left))
        field.addEventListener('blur', () => left.remove())
      },
      [ROOT, n],
    )
}

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

/** The case whose plain, themed and merged nodes the compiler marks carriers: the strip plants' host. */
export const MARK_PLANT_CASE = 'identity-marked-routes'

/** Takes the carrier mark off the node keyed `key`, which the compiler writes among the markers before its key. */
export const stripMark = key => code => code.replace(new RegExp(`__meo\\$r: 1,\\n((?:\\s*__meo\\$\\w+: [^\\n]*\\n)*\\s*key: '${key}',)`), '$1')

/**
 * Plants in the compiler's output rather than on the page: each rewrites the
 * "on" side's compiled module of one case (and the parts it imports), and
 * the run must find a difference from the oracle that the unrewritten output
 * does not have, in some server mode the case runs in, each recorded; in
 * `dimension`, when the plant names one. `client` names the case's variant
 * mounted on the client only, which the plant's rewrite reaches too, and
 * whose modes are recorded as well. `html` rewrites
 * the planted side's [plain] server HTML instead of, or besides, its
 * compiled output. A plant with
 * `noDifference` pins a rewrite the browser cannot see, for the reason it
 * gives: the rewrite must change the output and the run must find nothing.
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
    client: 'identity-host-toggle-client',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
  },
  {
    name: 'the carrier marks stripped (factory-toggle)',
    case: 'identity-factory-toggle',
    client: 'identity-factory-toggle-client',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
  },
  {
    name: 'the carrier marks stripped (host-reorder)',
    case: 'identity-host-reorder',
    client: 'identity-host-reorder-client',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
  },
  {
    name: 'the carrier marks stripped (host-list)',
    case: 'identity-host-list',
    client: 'identity-host-list-client',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
  },
  {
    name: 'the in-place marker stripped from the server HTML',
    case: 'structural-direct-hydrate',
    // Without the marker the client takes the page for a registry page and renders no style slots, so its tree
    // differs from the server's: hydration fails, or the useId consumer's id forks from the server's.
    html: html => html.replace(/ data-meonode-place(="")?/g, ''),
  },
  {
    name: 'the in-place marker stripped (one style twice)',
    case: 'slot-dedup-siblings-hydrate',
    // The second of two named siblings with one style carries the page's only marker; without it the client
    // renders no style slots and its tree differs from the server's.
    html: html => html.replace(/ data-meonode-place(="")?/g, ''),
  },
  {
    name: 'the carrier mark stripped (plain)',
    case: MARK_PLANT_CASE,
    client: `${MARK_PLANT_CASE}-client`,
    // Without its mark the node follows a component on one render and a rule on the next, so the toggle changes
    // its element type and React remounts it.
    dimension: 'identity',
    rewrite: stripMark('marked-plain'),
  },
  {
    name: 'the carrier mark stripped (merged)',
    case: MARK_PLANT_CASE,
    client: `${MARK_PLANT_CASE}-client`,
    dimension: 'identity',
    rewrite: stripMark('marked-merged'),
  },
  {
    name: 'the carrier mark stripped (themed)',
    case: MARK_PLANT_CASE,
    client: `${MARK_PLANT_CASE}-client`,
    noDifference: 'the runtime makes every themed named node a carrier as its walk begins, so the mark changes nothing it renders',
    rewrite: stripMark('marked-themed'),
  },
  {
    name: 'the carrier marks stripped (footer)',
    case: 'identity-footer',
    client: 'identity-footer-client',
    // Without its mark the node is a carrier only while no rule comes before it, so the step changes its element
    // type and React remounts it: styles and tree stay equal, and only identity shows it.
    dimension: 'identity',
    rewrite: code => code.replace(/\s*__meo\$r: 1,?/g, '').replace(/(__meoSite\d+ = \{\s*at: \d+),\s*r: 1/g, '$1'),
  },
  {
    name: 'the carrier marks stripped (helper-exported)',
    case: 'identity-helper-exported',
    client: 'identity-helper-exported-client',
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
 * stays a failure. `exactly` names the text every difference of its dimension
 * must hold and, for each way states are forced (`protocol` through the
 * DevTools protocol, `input` through real input), the states of one element
 * those differences must be in: one each, and none in any other. `text` names
 * a text one difference of its dimension must hold. `recovers` marks a plant
 * the harness must recover from: it must leave no difference, and the record
 * field it names must be set. `excused` marks one the confirmation must leave
 * out as unstable, so that no difference is left. `alike` marks no plant at
 * all, a check that a state's own DOM, present on both pages, makes no
 * difference: both records must hold an element only a forced state has. `input` marks a plant only real input can set off: where
 * states are forced through the DevTools protocol no pointer moves, so it is
 * skipped there.
 */
export const PLANTS = [
  { dimension: 'computed', page: addRule(`${ROOT} { ${WRONG} }`) },
  // A multi-column box 1px taller, and the boxes stretched with it: every value it changes is a size or an origin, which
  // layout snapping excuses in Firefox up to one app unit plus the snaps inside the box (compare.mjs, markSnapped), so it
  // must stay a failure.
  // The block that adds the pixel is a script element, which the comparison skips.
  {
    dimension: 'computed',
    name: 'a multi-column box 1px taller',
    page: page =>
      page.evaluate(root => {
        const block = Object.assign(document.createElement('script'), { type: 'text/plain' })
        block.style.cssText = 'display: block; height: 1px'
        document.querySelector(`${root} [data-parity-columns]`).append(block)
      }, ROOT),
  },
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
  // One value in one part of one element: the forced-state diff must report exactly that value in exactly those
  // states, so a diff that mishandles a part or an out-of-scope element cannot hide behind a plant that changes many.
  // Under real input :active is read with the pointer still over the element, so the :hover rule shows there too.
  {
    dimension: 'forced-state',
    name: 'one ::before value under :hover',
    page: addRule(`${ROOT} button:hover::before { background-color: rgb(1, 2, 3) }`),
    exactly: { text: '/1/background-color:', states: { protocol: [':hover'], input: [':hover', ':active'] } },
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
  // Only inside a sweep, and on alternate loads of the planted page: its repeated sweeps disagree, and its fresh loads,
  // which read its pointer states only, all read what the oracle's do. Its first record was a load outlier, so the state
  // is left out as unstable, while the alternate-loads plant above, which fresh loads reproduce, stays a failure.
  {
    dimension: 'forced-state',
    name: 'a difference on alternate sweeps of the planted page only, never on a fresh load',
    input: true,
    excused: true,
    page: onAlternateLoads(afterKeyPress(`${ROOT} :hover, ${ROOT}:hover { ${WRONG} }`)),
  },
  // The same for DOM an earlier state left ahead of other elements: by tree path, only the span itself differs.
  {
    dimension: 'forced-state',
    name: 'an element left ahead of others on alternate sweeps of the planted page only',
    input: true,
    excused: true,
    page: onAlternateLoads(mountAfterCrossing(CROSSED_BEFORE_PLANT)),
  },
  // A real difference beside such a span, in the same states only (not under the press, where the span is not left):
  // the field's own rule, in every sweep (after the pointer has crossed earlier elements) and on no fresh load. The
  // span's unit is left out alone, and the field's difference, which the shared unit holds steadily, is confirmed.
  {
    dimension: 'forced-state',
    name: 'a real in-session difference beside an element left on alternate sweeps',
    input: true,
    confirm: 'in-session',
    page: (() => {
      const span = onAlternateLoads(mountAfterCrossing(CROSSED_BEFORE_PLANT))
      const rule = afterCrossing(CROSSED_BEFORE_PLANT, `${ROOT} input[placeholder]:focus:not(:active) { ${WRONG} }`)
      return async page => {
        await span(page)
        await rule(page)
      }
    })(),
  },
  // A difference on one property in the first record and on another in every load after: the sweeps still differ
  // from the oracle, on entries the first record did not, so the state stays a failure.
  {
    dimension: 'forced-state',
    name: 'a difference that moves to another property after the first load',
    page: (() => {
      let loads = 0
      return page =>
        page.addStyleTag({ content: `${ROOT} input[placeholder]:focus { ${loads++ === 0 ? WRONG : 'word-spacing: 7px !important'} }` })
    })(),
  },
  // A hover and a press no sweep of the oracle holds (the box's hover moves it out of the viewport, so the pointer
  // never settles on it) and the planted page does: with no oracle sample to judge by, both are left out as unstable,
  // and the planted rule leaves no difference.
  {
    dimension: 'forced-state',
    name: 'a hover and a press the oracle never holds and the planted page does',
    input: true,
    excused: true,
    page: addRule(`${ROOT} [data-parity-away]:hover { transform: none !important; ${WRONG} }`),
  },
  // The hint the field mounts while it has focus, ahead of the toggle, on both pages: no difference.
  { dimension: 'forced-state', name: 'an element a state mounts ahead of others, alike on both pages', input: true, alike: true },
  // A :hover left behind at a reset: the sweep reloads the page and goes on, and a second one fails the page naming both.
  { dimension: 'hydration', name: 'a stuck :hover the reload clears', input: true, recovers: 'reloadedFor', page: stuckHover({ again: false }) },
  { dimension: 'hydration', name: 'a stuck :hover after the reload too', input: true, text: ', after a reload for stray :hover', page: stuckHover({ again: true }) },
  { dimension: 'forced-state', name: "a point blind to a child's box", input: true, pointer: true, page: pointBlindToChildren('[data-parity-inner]') },
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
  // Elements matched by tree path (collect.mjs, readStyles): one missing at load is named by its place, and under a
  // forced state an element only the state mounts is compared too, whether both pages mount it or one alone does.
  {
    dimension: 'tree',
    name: 'an element missing at load',
    text: 'element missing on the side: ',
    page: page => page.evaluate(root => document.querySelector(`${root} input[type="checkbox"]`).remove(), ROOT),
  },
  { dimension: 'forced-state', name: 'an element only a state mounts, one property planted', input: true, page: addRule(`${ROOT} [data-parity-hint] { ${WRONG} }`) },
  {
    dimension: 'forced-state',
    name: 'an element one page alone mounts under a state',
    input: true,
    page: page =>
      page.evaluate(root => {
        const field = document.querySelector(`${root} input[placeholder]`)
        const extra = Object.assign(document.createElement('span'), { textContent: 'extra' })
        field.addEventListener('focus', () => document.querySelector(root).append(extra))
        field.addEventListener('blur', () => extra.remove())
      }, ROOT),
  },
  { dimension: 'console', page: page => page.evaluate(() => console.error('planted error')) },
  // A server text the client does not render: React reports the mismatch, and the server HTML differs.
  { dimension: 'hydration', html: body => body.replace('Plant target', 'Plant targe') },
  { dimension: 'ssr-html', html: body => body.replace('Plant target', 'Plant targe') },
]
