// Loads one case of one side in the browser and records everything the parity
// comparison checks: the element tree, every element's computed style and its
// ::before/::after, forced pseudo-class states, each viewport, colour scheme
// and theme mode, each state step, and hydration errors.
//
// readTree, readStyles and settle run in the page, so they use its globals.
/* global Node, getComputedStyle, requestAnimationFrame, CSS */

/** The elements compared: everything under #root except what carries no rendered styles of its own. */
const SKIPPED_TAGS = ['STYLE', 'SCRIPT', 'LINK', 'NOSCRIPT', 'TEMPLATE']
/** The pseudo-classes forced on every element. */
export const FORCED_STATES = ['hover', 'focus', 'focus-visible', 'active']
/** The viewport width every case is checked at, besides its breakpoints. */
export const BASE_WIDTH = 1280
const HEIGHT = 900

/**
 * Runs in the page: the element tree under #root, as one string per element in
 * document order, ignoring class names and `--mv-*` inline variables.
 */
function readTree(skipped) {
  const out = []
  const walk = (node, depth) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push(`${'  '.repeat(depth)}#text ${JSON.stringify(child.data)}`)
      } else if (child.nodeType === Node.ELEMENT_NODE && !skipped.includes(child.tagName)) {
        const attrs = []
        for (const { name, value } of child.attributes) {
          if (name === 'class') continue
          if (name === 'style') {
            const kept = []
            for (let i = 0; i < child.style.length; i++) {
              const prop = child.style[i]
              if (!prop.startsWith('--mv-'))
                kept.push(`${prop}:${child.style.getPropertyValue(prop)}${child.style.getPropertyPriority(prop) ? '!important' : ''}`)
            }
            if (kept.length) attrs.push(`style=${JSON.stringify(kept.join(';'))}`)
            continue
          }
          attrs.push(`${name}=${JSON.stringify(value)}`)
        }
        out.push(
          `${'  '.repeat(depth)}<${child.tagName.toLowerCase()}${attrs
            .sort()
            .map(a => ` ${a}`)
            .join('')}>`,
        )
        walk(child, depth + 1)
      }
    }
  }
  walk(document.getElementById('root'), 0)
  return out
}

/**
 * Runs in the page: the computed style of every compared element and of its
 * ::before, ::after and ::selection, and of the ::placeholder of inputs and
 * text areas (empty for other elements), as arrays of values over one
 * property list. ::selection is read only when a stylesheet on the page has a
 * ::selection rule: with none, Chrome's computed ::selection depends on what
 * it computed before (the same element read twice gives the element's colour
 * once and black once), and a user sees the browser's default either way. Given `[skipped, index]`, only the elements inside the
 * `data-parity-scope` element holding the element at `index` are read, and
 * the others are null.
 */
function readStyles(arg) {
  const [skipped, scopeIndex] = Array.isArray(arg[0]) ? arg : [arg, null]
  const elements = [...document.querySelectorAll('#root *')].filter(el => !skipped.includes(el.tagName))
  const scope = scopeIndex === null ? null : elements[scopeIndex].closest('[data-parity-scope]')
  const first = elements.length ? getComputedStyle(elements[0]) : getComputedStyle(document.body)
  // The compiler's `--mv-*` variables are ignored: they carry values, and what they style is compared.
  // A case's own custom properties (`meta.customProps`) are read on every element.
  const props = [...new Set([...first].filter(p => !p.startsWith('--mv-')).concat(window.__parityCustomProps ?? []))].sort()
  const values = cs => props.map(p => cs.getPropertyValue(p))
  const hasSelectionRule = rules => [...rules].some(r => /::selection/.test(r.selectorText ?? '') || (r.cssRules && hasSelectionRule(r.cssRules)))
  const readSelection = [...document.styleSheets].some(sheet => {
    try {
      return hasSelectionRule(sheet.cssRules)
    } catch {
      return false
    }
  })
  return {
    props,
    paths: elements.map(el => {
      const path = []
      for (let e = el; e && e.id !== 'root'; e = e.parentElement)
        path.unshift(`${e.tagName.toLowerCase()}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`)
      return path.join(' > ')
    }),
    elements: elements.map(el =>
      scope && !scope.contains(el)
        ? null
        : [
            values(getComputedStyle(el)),
            values(getComputedStyle(el, '::before')),
            values(getComputedStyle(el, '::after')),
            el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? values(getComputedStyle(el, '::placeholder')) : [],
            readSelection ? values(getComputedStyle(el, '::selection')) : [],
          ],
    ),
  }
}

/** Waits for two frames, so effects and style recalculation have run. */
const settle = page =>
  page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))).then(() => finishTransitions(page))

/** Where an infinite animation is paused, as a fraction of one iteration: off both ends and off the middle, so a keyframe value or a timing function that differs shows. */
const INFINITE_FRAME = 0.37

/**
 * Brings every running animation to a fixed frame, so a read does not depend
 * on when it happens: CSS transitions and finite keyframe animations run to
 * their end, the state a user sees once a change has played out (with the
 * fill mode deciding what stays), and infinite ones are paused at
 * `INFINITE_FRAME` of their first iteration. An animation or transition on an element
 * inside one marked `data-parity-sample` is instead paused at the time the
 * mark gives, in ms (a @starting-style transition, a @keyframes animation).
 * One a stylesheet pauses is left at its frame. `getAnimations` flushes
 * pending style first, so a transition the last change started is included.
 */
const finishTransitions = page =>
  page.evaluate(frame => {
    for (const animation of document.getAnimations()) {
      const sample = animation.effect?.target?.closest?.('[data-parity-sample]')
      if (sample) {
        animation.pause()
        animation.currentTime = Number(sample.getAttribute('data-parity-sample'))
      } else if (animation.playState !== 'running') continue
      else if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish()
      else {
        const { delay = 0, duration } = animation.effect.getComputedTiming()
        animation.pause()
        animation.currentTime = delay + frame * Number(duration)
      }
    }
  }, INFINITE_FRAME)

/**
 * Runs in the page: each element marked `data-parity-exact`, as its outer HTML
 * with class names, and the text of every top-level rule, in document order,
 * that names a class of it or of an element inside it.
 */
function readExact() {
  const marked = [...document.querySelectorAll('#root [data-parity-exact]')]
  if (!marked.length) return []
  const rules = []
  for (const sheet of document.styleSheets) {
    let list
    try {
      list = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of list) rules.push(rule.cssText)
  }
  return marked.map(el => {
    const classes = new Set([el, ...el.querySelectorAll('*')].flatMap(e => [...e.classList]))
    const names = [...classes].map(c => new RegExp(`\\.${CSS.escape(c)}(?![\\w-])`))
    return { html: el.outerHTML, rules: rules.filter(text => names.some(n => n.test(text))) }
  })
}

/** One full snapshot: tree and styles. */

/**
 * Runs in the page: the rules of MeoNode's extracted classes (`.mn-*`) that
 * the page's stylesheets hold more than once, each with its count. A class's
 * rule is inserted once per page; a second copy, from a server style and a
 * browser insertion of the same class, moves where the rule sits.
 */
function readDuplicateRules() {
  const counts = new Map()
  const walk = rules => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) walk(rule.cssRules)
      else if (/\.mn-/.test(rule.cssText)) counts.set(rule.cssText, (counts.get(rule.cssText) ?? 0) + 1)
    }
  }
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules)
    } catch {
      // A sheet from another origin cannot be read; the harness serves none.
    }
  }
  return [...counts].filter(([, n]) => n > 1).map(([text, n]) => `${n}× ${text}`)
}

const snapshot = async page => ({ tree: await page.evaluate(readTree, SKIPPED_TAGS), styles: await page.evaluate(readStyles, SKIPPED_TAGS) })

/** Marks every element of the case, so a step can tell the elements it kept from those it mounted anew. */
function markElements(skipped) {
  for (const el of document.querySelectorAll('#root *')) if (!skipped.includes(el.tagName)) el.__parityKept = true
}

/**
 * Each element of the case after a step, in the snapshot's order: its tag,
 * whether the step mounted it anew, and for a form field the value it holds.
 * A remount (a subtree whose identity the step lost, so its state goes with
 * it) shows as new elements where the oracle kept its own, and an emptied
 * field, even when the tree and the styles are equal. Style and script
 * elements are skipped, as everywhere: the sides place them differently.
 */
function readIdentity(skipped) {
  return [...document.querySelectorAll('#root *')]
    .filter(el => !skipped.includes(el.tagName))
    .map(
      el =>
        `${el.tagName.toLowerCase()}${el.__parityKept ? '' : ' (mounted by the step)'}${'value' in el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ? ` value ${JSON.stringify(el.value)}` : ''}`,
    )
}

/**
 * How forced states are produced: through the DevTools protocol in Chromium,
 * and through real pointer and focus input in the other engines, or in
 * Chromium too with PARITY_FORCE=input.
 */
const FORCE_BY_CDP = (process.env.PARITY_BROWSER ?? 'chromium') === 'chromium' && process.env.PARITY_FORCE !== 'input'

/** The computed values in `now` that differ from `base`, keyed `<element index>/<part>/<prop>`. */
function changedFrom(now, base) {
  const changed = {}
  now.elements.forEach((parts, e) =>
    parts?.forEach((vals, part) =>
      vals.forEach((v, p) => {
        if (v !== base.elements[e]?.[part]?.[p]) changed[`${e}/${part}/${now.props[p]}`] = v
      }),
    ),
  )
  return changed
}

/**
 * For each compared element and each forced pseudo-class, the properties of any
 * element whose computed value differs from the unforced state.
 * @returns Entries `<element index>:<state>` → `{ <element index>/<part>/<prop>: value }`.
 */
const forcedStates = async (page, base, meta, samples = {}) => {
  const sets = [...FORCED_STATES.map(state => [state]), ...(meta.forceCombos ?? [])]
  const onlyMarked = meta.force === 'marked'
  // A read while one element is forced: every element, or with `forceScope: 'fixture'` its own fixture's.
  const read = index => page.evaluate(readStyles, meta.forceScope === 'fixture' ? [SKIPPED_TAGS, index] : SKIPPED_TAGS)
  return {
    ...(await (FORCE_BY_CDP ? forcedByCdp(page, base, sets, onlyMarked, read) : forcedByInput(page, base, sets, onlyMarked, read, Infinity, samples))),
    ...(await domStates(page, base)),
  }
}

/**
 * Runs in the page: for each compared element, whether pseudo-classes are
 * forced on it: every element, or with `meta.force: 'marked'` only those
 * marked `data-parity-force`.
 */
function forcedTargets([skipped, onlyMarked]) {
  return [...document.querySelectorAll('#root *')].filter(el => !skipped.includes(el.tagName)).map(el => !onlyMarked || el.hasAttribute('data-parity-force'))
}

/** The states set through the DOM, on the elements that have them, in every engine alike. */
export const DOM_STATES = ['checked', 'disabled', 'placeholder-shown']

/**
 * Runs in the page: flips one DOM state of the compared element at `index`
 * and returns whether it applied. `checked` toggles a checkbox or radio,
 * `disabled` disables a form control, and `placeholder-shown` empties or fills
 * an input or text area that has a placeholder. The first flip stores how to
 * undo it on `window.__parityUndo`.
 */
function flipState([index, state, skipped]) {
  const el = [...document.querySelectorAll('#root *')].filter(e => !skipped.includes(e.tagName))[index]
  if (state === 'checked' && el.matches('input[type="checkbox"], input[type="radio"]')) {
    const was = el.checked
    el.checked = !was
    window.__parityUndo = () => (el.checked = was)
    return true
  }
  if (state === 'disabled' && 'disabled' in el && el.tagName !== 'LINK') {
    const was = el.disabled
    el.disabled = !was
    window.__parityUndo = () => (el.disabled = was)
    return true
  }
  if (state === 'placeholder-shown' && el.matches('input[placeholder], textarea[placeholder]')) {
    const was = el.value
    el.value = was === '' ? 'filled' : ''
    window.__parityUndo = () => (el.value = was)
    return true
  }
  return false
}

/** For each compared element and each DOM state it has, what changes while the state is flipped. */
async function domStates(page, base) {
  const out = {}
  for (let index = 0; index < base.elements.length; index++) {
    for (const state of DOM_STATES) {
      if (!(await page.evaluate(flipState, [index, state, SKIPPED_TAGS]))) continue
      await settle(page)
      await assertNoHover(page, `the ${state} read of element ${index}`)
      const now = await page.evaluate(readStyles, SKIPPED_TAGS)
      await page.evaluate(() => window.__parityUndo())
      await settle(page)
      out[`${index}:${state}`] = changedFrom(now, base)
    }
  }
  return out
}

/** Forced states through CSS.forcePseudoState, each set of pseudo-classes at once. */
async function forcedByCdp(page, base, sets, onlyMarked, read) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#root *' })
  const kept = await page.evaluate(skipped => [...document.querySelectorAll('#root *')].map(el => !skipped.includes(el.tagName)), SKIPPED_TAGS)
  const ids = nodeIds.filter((_, i) => kept[i])
  const targets = await page.evaluate(forcedTargets, [SKIPPED_TAGS, onlyMarked])
  const out = {}
  for (const [index, nodeId] of ids.entries()) {
    if (!targets[index]) continue
    for (const states of sets) {
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states })
      await finishTransitions(page)
      const now = await read(index)
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
      await finishTransitions(page)
      out[`${index}:${states.join('+')}`] = changedFrom(now, base)
    }
  }
  await cdp.detach()
  return out
}

/**
 * Forced states through real input: the pointer over the element's centre for
 * :hover, pressed there for :active (and released away from it, so nothing is
 * clicked), focus after a pointer click for :focus, and focus after a key press
 * for :focus-visible. An element with no box gets no pointer states.
 */
async function forcedByInput(page, base, sets, onlyMarked, read, upTo = Infinity, samples = {}) {
  const elements = await comparedElements(page)
  const targets = await page.evaluate(forcedTargets, [SKIPPED_TAGS, onlyMarked])
  const out = {}
  for (const [index, element] of elements.entries()) {
    if (index > upTo) break
    if (!targets[index]) continue
    const centre = await centreOf(element)
    await settle(page)
    for (const states of sets) {
      const key = `${index}:${states.join('+')}`
      const { changed, held, waited, layout, stray } = await applyByInput(page, base, element, index, centre, states, read)
      out[key] = changed
      samples[key] = { held, waited, layout, ...(stray && { stray }) }
    }
  }
  await resetInput(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  return out
}

/** The compared elements' handles, in the order every record indexes them. */
async function comparedElements(page) {
  const all = await page.$$('#root *')
  const kept = await page.evaluate(skipped => [...document.querySelectorAll('#root *')].map(el => !skipped.includes(el.tagName)), SKIPPED_TAGS)
  return all.filter((_, i) => kept[i])
}

/** The element's centre after scrolling it into view, or null when it has no box. */
async function centreOf(element) {
  await element.scrollIntoViewIfNeeded().catch(() => {})
  const box = await element.boundingBox()
  return box && box.width > 0 && box.height > 0 ? [box.x + box.width / 2, box.y + box.height / 2] : null
}

/** The side of the blank square the pointer rests on between states, in px. */
const NEUTRAL_SIZE = 8
/** Where the pointer rests between states: the centre of the neutral square. */
const NEUTRAL = [BASE_WIDTH - NEUTRAL_SIZE / 2, HEIGHT - NEUTRAL_SIZE / 2]

/**
 * Puts a blank square of the harness's own above everything in the
 * viewport's corner, outside #root, so the pointer resting there (and the
 * click that clears focus) touches no page content however far the page has
 * scrolled. It is outside every compared element and takes no layout.
 */
async function ensureNeutral(page) {
  await page.evaluate(size => {
    if (document.getElementById('parity-neutral')) return
    const square = document.createElement('div')
    square.id = 'parity-neutral'
    square.style.cssText = `position:fixed;right:0;bottom:0;width:${size}px;height:${size}px;z-index:2147483647;background:transparent;margin:0;padding:0;border:0`
    document.documentElement.append(square)
  }, NEUTRAL_SIZE)
}

/** The pointer on the neutral square, outside every compared element. */
async function toNeutral(page) {
  await ensureNeutral(page)
  await page.mouse.move(...NEUTRAL)
}

/**
 * Runs in the page: the compared elements that match :hover and are neither
 * the element at `target` nor its ancestor or descendant, each as its index,
 * tag and class. With no target, every hovered compared element.
 */
function strayHovers([skipped, target]) {
  const all = [...document.querySelectorAll('#root *')].filter(el => !skipped.includes(el.tagName))
  const own = target == null ? null : all[target]
  return all.flatMap((el, i) =>
    el.matches(':hover') && !(own && (el.contains(own) || own.contains(el))) ? [`${i} ${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ').join('.')}` : ''}`] : [],
  )
}

/**
 * Before a read that sets no pointer state, with the pointer on the neutral
 * square: fails the page if a compared element still matches :hover, naming
 * it, since the read would carry a state the other side may lack.
 */
async function assertNoHover(page, where) {
  const stray = await page.evaluate(strayHovers, [SKIPPED_TAGS, null])
  if (stray.length) throw new Error(`stray :hover at ${where}: ${stray.join(', ')}`)
}

/** The pointer on the neutral square and nothing focused, then settled. */
async function resetInput(page) {
  await toNeutral(page)
  await page.evaluate(() => document.activeElement?.blur?.())
  await settle(page)
}

/** Frames to wait for real input to take effect before a read goes ahead without it. */
const STATE_WAIT_FRAMES = 30

/** Runs on the element: resolves once it matches every state, or after `frames` frames. */
function waitForStates(el, [states, frames]) {
  return new Promise(resolve => {
    let left = frames
    const tick = () => (states.every(state => el.matches(`:${state}`)) || --left <= 0 ? resolve(left > 0) : requestAnimationFrame(tick))
    tick()
  })
}

/** Applies one set of states to the element at `index` by real input, from a reset, and returns what changed from `base`. */
async function applyByInput(page, base, element, index, centre, states, read) {
  await resetInput(page)
  let pressed = false
  // Focus first, since moving focus by pointer would end a hover or a press.
  if (states.includes('focus')) {
    await page.mouse.click(...NEUTRAL)
    await element.evaluate(el => el.focus?.())
  }
  if (states.includes('focus-visible')) {
    // A key press marks the next focus as from the keyboard in Chromium; WebKit and Firefox take the option.
    await page.keyboard.press('Shift')
    await element.evaluate(el => el.focus?.({ focusVisible: true }))
  }
  if (states.includes('focus-within')) await element.evaluate(el => el.querySelector('input, button, select, textarea, a[href], [tabindex]')?.focus())
  // The centre measured again here: focus scrolls the element into view, so a point measured before it can lie on a neighbour.
  if ((states.includes('hover') || states.includes('active')) && centre) {
    centre = (await centreOf(element)) ?? centre
    await settle(page)
    await page.mouse.move(...centre)
  }
  if (states.includes('active') && centre) {
    await page.mouse.down()
    pressed = true
  }
  // Real input takes effect on the engine's own frame, so read only once the element matches the states the pointer set.
  const pointerStates = centre ? states.filter(state => state === 'hover' || state === 'active') : []
  const waited = pointerStates.length ? await element.evaluate(waitForStates, [pointerStates, STATE_WAIT_FRAMES]) : true
  await settle(page)
  const now = await read(index)
  // Whether the element still matched the pointer's states when it was read: a hover that moves the element from
  // under the pointer ends itself, and a read without the state is no sample of it.
  const kept = pointerStates.length ? await element.evaluate((el, list) => list.every(state => el.matches(`:${state}`)), pointerStates) : true
  // Any other hovered element is a state the read carries that the other side may lack: no sample either.
  const stray = await page.evaluate(strayHovers, [SKIPPED_TAGS, pointerStates.includes('hover') || pointerStates.includes('active') ? index : null])
  const held = kept && !stray.length
  // The scroll boxes a state can change: its fixture's and the document's, whose scrollbars an engine may add a frame late.
  const layout = await element.evaluate(el => {
    const box = node =>
      node && {
        overflowsX: node.scrollWidth > node.clientWidth,
        bar: node.offsetHeight - node.clientHeight,
        overflowX: getComputedStyle(node).overflowX,
        height: node.offsetHeight,
      }
    return { fixture: box(el.closest('[data-parity-scope]')), document: box(document.documentElement) }
  })
  if (pressed) {
    await page.mouse.move(...NEUTRAL)
    await page.mouse.up()
  }
  return { changed: changedFrom(now, base), held, waited, layout, ...(stray.length && { stray }) }
}

/**
 * Loads a case page afresh and sweeps its real-input forced states as
 * `collect` does, in the same order and along the same pointer path, up to
 * the element at `upTo`, for confirming a sweep difference in a session of its
 * own. A state that differs only after the pointer has crossed earlier
 * elements shows here, where a single fresh-load read cannot see it.
 * @returns `{ forced, samples }`: each real-input state's read, and whether its element held the state when read.
 */
export async function resweepForced(browser, url, meta, plant, upTo) {
  const page = await browser.newPage()
  try {
    await page.setViewportSize({ width: BASE_WIDTH, height: HEIGHT })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__parityShell !== undefined, null, { timeout: 10_000 })
    await page.waitForLoadState('networkidle')
    await page.evaluate(list => (window.__parityCustomProps = list), meta.customProps ?? [])
    await settle(page)
    if (plant) await plant(page)
    await page.evaluate(() => window.__parityShell.setMode('light'))
    await settle(page)
    const base = await page.evaluate(readStyles, SKIPPED_TAGS)
    const read = index => page.evaluate(readStyles, meta.forceScope === 'fixture' ? [SKIPPED_TAGS, index] : SKIPPED_TAGS)
    const sets = [...FORCED_STATES.map(state => [state]), ...(meta.forceCombos ?? [])].filter(set => set.every(state => INPUT_STATES.includes(state)))
    const samples = {}
    const forced = await forcedByInput(page, base, sets, meta.force === 'marked', read, upTo, samples)
    return { forced, samples }
  } finally {
    await page.close()
  }
}

/** The pseudo-classes real input applies, as opposed to the states flipped through the DOM. */
export const INPUT_STATES = ['hover', 'active', 'focus', 'focus-visible', 'focus-within']

/**
 * Loads a case page afresh, as `collect` does, and measures only the forced
 * states named by `keys` (`<element index>:<state>[+<state>…]`, real-input
 * states only), for confirming a forced-state difference on another load.
 * @returns `{ <key>: { <element index>/<part>/<prop>: value } }`, as `record.forced` holds them.
 */
export async function remeasureForced(browser, url, meta, plant, keys) {
  const page = await browser.newPage()
  try {
    await page.setViewportSize({ width: BASE_WIDTH, height: HEIGHT })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__parityShell !== undefined, null, { timeout: 10_000 })
    await page.waitForLoadState('networkidle')
    await page.evaluate(list => (window.__parityCustomProps = list), meta.customProps ?? [])
    await settle(page)
    if (plant) await plant(page)
    await page.evaluate(() => window.__parityShell.setMode('light'))
    await settle(page)
    const base = await page.evaluate(readStyles, SKIPPED_TAGS)
    const read = index => page.evaluate(readStyles, meta.forceScope === 'fixture' ? [SKIPPED_TAGS, index] : SKIPPED_TAGS)
    const elements = await comparedElements(page)
    const out = {}
    for (const key of keys) {
      const [at, list] = key.split(':')
      const index = Number(at)
      const element = elements[index]
      out[key] = element ? (await applyByInput(page, base, element, index, await centreOf(element), list.split('+'), read)).changed : null
    }
    return out
  } finally {
    await page.close()
  }
}

/**
 * Loads a case page and records every comparison input.
 * @param browser A connected browser with `newPage()`.
 * @param url The case page.
 * @param meta The case's meta.
 * @param plant A function run in Node against the page after hydration, to plant a wrong rule; or null.
 * @param spend Told the milliseconds each phase took: `load`, `environments`, `forced` and `steps`.
 * @returns The record.
 */
export async function collect(browser, url, meta, plant, spend = () => {}) {
  let started = performance.now()
  /** Ends a phase: tells `spend` its time and starts the next. */
  const lap = phase => {
    const now = performance.now()
    spend(phase, now - started)
    started = now
  }
  const page = await browser.newPage()
  const messages = []
  page.on('console', m => (m.type() === 'error' || m.type() === 'warning') && messages.push(`${m.type()}: ${m.text().slice(0, 300)}`))
  page.on('pageerror', e => messages.push(`pageerror: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 4).join('\n')}` : ''}`))
  try {
    await page.setViewportSize({ width: BASE_WIDTH, height: HEIGHT })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(url, { waitUntil: 'load' })
    await page
      .waitForFunction(() => window.__parityShell !== undefined, null, { timeout: 10_000 })
      .catch(error => {
        throw new Error(`${url} never published its mode controls; page messages:\n${messages.join('\n') || '(none)'}`, { cause: error })
      })
    await page.waitForLoadState('networkidle')
    await page.evaluate(list => (window.__parityCustomProps = list), meta.customProps ?? [])
    await settle(page)
    if (plant) await plant(page)
    await settle(page)
    const record = { console: messages, hydration: await page.evaluate(() => window.__parityErrors), envs: {}, forced: {}, steps: {} }
    record.duplicateRules = await page.evaluate(readDuplicateRules)
    lap('load')

    const widths = [BASE_WIDTH, ...(meta.breakpoints ?? []).flatMap(b => [b - 1, b, b + 1])]
    const variants = meta.environments === 'base' ? ['light'] : ['light', 'dark']
    for (const width of widths) {
      for (const scheme of variants) {
        for (const mode of variants) {
          await page.setViewportSize({ width, height: HEIGHT })
          await page.emulateMedia({ colorScheme: scheme })
          await page.evaluate(m => window.__parityShell.setMode(m), mode)
          await settle(page)
          record.envs[`${width}px ${scheme}-scheme ${mode}-mode`] = await snapshot(page)
        }
      }
    }
    await page.setViewportSize({ width: BASE_WIDTH, height: HEIGHT })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.evaluate(() => window.__parityShell.setMode('light'))
    if (meta.reducedMotion) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await settle(page)
      record.envs[`${BASE_WIDTH}px light-scheme light-mode reduced-motion`] = await snapshot(page)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
    lap('environments')
    await settle(page)
    const base = await page.evaluate(readStyles, SKIPPED_TAGS)
    record.exact = await page.evaluate(readExact)
    // Each real-input read's sample: whether the element held its states when read, and whether it took them in time.
    record.forcedSamples = {}
    record.forced = await forcedStates(page, base, meta, record.forcedSamples)
    lap('forced')

    for (const step of meta.steps ?? []) {
      await page.evaluate(markElements, SKIPPED_TAGS)
      if (step.click) {
        await page.click(step.click)
        // Off the content, so no element keeps a real hover the other side lacks.
        await toNeutral(page)
      }
      if (step.type) await page.fill(step.type[0], step.type[1])
      if (step.mode) await page.evaluate(m => window.__parityShell.setMode(m), step.mode)
      await page.waitForLoadState('networkidle')
      await settle(page)
      await assertNoHover(page, `step "${step.name}"`)
      record.steps[step.name] = { ...(await snapshot(page)), identity: await page.evaluate(readIdentity, SKIPPED_TAGS) }
    }
    record.hydration = await page.evaluate(() => window.__parityErrors)
    lap('steps')
    return record
  } finally {
    await page.close()
  }
}

/**
 * Records the server HTML as a visitor sees it before any script runs: the
 * page is loaded with its client bundle answered empty, so nothing hydrates
 * and every server `<style>` stays where the server wrote it. Inline styles
 * among an element's siblings decide what structural selectors
 * (`:first-child`, `:nth-child`, `+`) match until hydration moves them, so
 * this is the record that shows a different number or placement of them.
 * Only the base environment is read: switching modes needs the client.
 */
export async function collectFirstPaint(browser, url, meta, plant) {
  const page = await browser.newPage()
  try {
    // A route added later is matched first, so this one wins over the page's own.
    await page.route('**/client.js', route => route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: '' }))
    await page.setViewportSize({ width: BASE_WIDTH, height: HEIGHT })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(url, { waitUntil: 'load' })
    // The client publishes its mode controls when it runs; here it must not have.
    if (await page.evaluate(() => window.__parityShell !== undefined)) throw new Error(`${url} ran its client before hydration was withheld`)
    await page.evaluate(list => (window.__parityCustomProps = list), meta.customProps ?? [])
    if (plant) await plant(page)
    await settle(page)
    return { [`${BASE_WIDTH}px light-scheme light-mode before hydration`]: await snapshot(page) }
  } finally {
    await page.close()
  }
}
