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
              if (!prop.startsWith('--mv-')) kept.push(`${prop}:${child.style.getPropertyValue(prop)}${child.style.getPropertyPriority(prop) ? '!important' : ''}`)
            }
            if (kept.length) attrs.push(`style=${JSON.stringify(kept.join(';'))}`)
            continue
          }
          attrs.push(`${name}=${JSON.stringify(value)}`)
        }
        out.push(`${'  '.repeat(depth)}<${child.tagName.toLowerCase()}${attrs.sort().map(a => ` ${a}`).join('')}>`)
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
 * property list. Given `[skipped, index]`, only the elements inside the
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
  return {
    props,
    paths: elements.map(el => {
      const path = []
      for (let e = el; e && e.id !== 'root'; e = e.parentElement) path.unshift(`${e.tagName.toLowerCase()}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`)
      return path.join(' > ')
    }),
    elements: elements.map(el => scope && !scope.contains(el) ? null : [
      values(getComputedStyle(el)),
      values(getComputedStyle(el, '::before')),
      values(getComputedStyle(el, '::after')),
      el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? values(getComputedStyle(el, '::placeholder')) : [],
      values(getComputedStyle(el, '::selection')),
    ]),
  }
}

/** Waits for two frames, so effects and style recalculation have run. */
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))).then(() => finishTransitions(page))

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
const snapshot = async page => ({ tree: await page.evaluate(readTree, SKIPPED_TAGS), styles: await page.evaluate(readStyles, SKIPPED_TAGS) })

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
const forcedStates = async (page, base, meta) => {
  const sets = [...FORCED_STATES.map(state => [state]), ...(meta.forceCombos ?? [])]
  const onlyMarked = meta.force === 'marked'
  // A read while one element is forced: every element, or with `forceScope: 'fixture'` its own fixture's.
  const read = index => page.evaluate(readStyles, meta.forceScope === 'fixture' ? [SKIPPED_TAGS, index] : SKIPPED_TAGS)
  return { ...(await (FORCE_BY_CDP ? forcedByCdp(page, base, sets, onlyMarked, read) : forcedByInput(page, base, sets, onlyMarked, read))), ...(await domStates(page, base)) }
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
async function forcedByInput(page, base, sets, onlyMarked, read) {
  const all = await page.$$('#root *')
  const kept = await page.evaluate(skipped => [...document.querySelectorAll('#root *')].map(el => !skipped.includes(el.tagName)), SKIPPED_TAGS)
  const elements = all.filter((_, i) => kept[i])
  const targets = await page.evaluate(forcedTargets, [SKIPPED_TAGS, onlyMarked])
  const away = () => page.mouse.move(BASE_WIDTH - 1, HEIGHT - 1)
  const reset = async () => {
    await away()
    await page.evaluate(() => document.activeElement?.blur?.())
    await settle(page)
  }
  const out = {}
  for (const [index, element] of elements.entries()) {
    if (!targets[index]) continue
    await element.scrollIntoViewIfNeeded().catch(() => {})
    const box = await element.boundingBox()
    const centre = box && box.width > 0 && box.height > 0 ? [box.x + box.width / 2, box.y + box.height / 2] : null
    for (const states of sets) {
      await reset()
      let pressed = false
      // Focus first, since moving focus by pointer would end a hover or a press.
      if (states.includes('focus')) {
        await page.mouse.click(BASE_WIDTH - 1, HEIGHT - 1)
        await element.evaluate(el => el.focus?.())
      }
      if (states.includes('focus-visible')) {
        // A key press marks the next focus as from the keyboard in Chromium; WebKit and Firefox take the option.
        await page.keyboard.press('Shift')
        await element.evaluate(el => el.focus?.({ focusVisible: true }))
      }
      if (states.includes('focus-within')) await element.evaluate(el => el.querySelector('input, button, select, textarea, a[href], [tabindex]')?.focus())
      if ((states.includes('hover') || states.includes('active')) && centre) await page.mouse.move(...centre)
      if (states.includes('active') && centre) {
        await page.mouse.down()
        pressed = true
      }
      await settle(page)
      const now = await read(index)
      if (pressed) {
        await away()
        await page.mouse.up()
      }
      out[`${index}:${states.join('+')}`] = changedFrom(now, base)
    }
  }
  await reset()
  await page.evaluate(() => window.scrollTo(0, 0))
  return out
}

/**
 * Loads a case page and records every comparison input.
 * @param browser A connected browser with `newPage()`.
 * @param url The case page.
 * @param meta The case's meta.
 * @param plant A function run in Node against the page after hydration, to plant a wrong rule; or null.
 * @returns The record.
 */
export async function collect(browser, url, meta, plant) {
  const page = await browser.newPage()
  const messages = []
  page.on('console', m => (m.type() === 'error' || m.type() === 'warning') && messages.push(`${m.type()}: ${m.text().slice(0, 300)}`))
  page.on('pageerror', e => messages.push(`pageerror: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 4).join('\n')}` : ''}`))
  try {
    await page.setViewportSize({ width: BASE_WIDTH, height: HEIGHT })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__parityShell !== undefined, null, { timeout: 10_000 }).catch(error => {
      throw new Error(`${url} never published its mode controls; page messages:\n${messages.join('\n') || '(none)'}`, { cause: error })
    })
    await page.waitForLoadState('networkidle')
    await page.evaluate(list => (window.__parityCustomProps = list), meta.customProps ?? [])
    await settle(page)
    if (plant) await plant(page)
    await settle(page)
    const record = { console: messages, hydration: await page.evaluate(() => window.__parityErrors), envs: {}, forced: {}, steps: {} }

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
    await settle(page)
    const base = await page.evaluate(readStyles, SKIPPED_TAGS)
    record.exact = await page.evaluate(readExact)
    record.forced = await forcedStates(page, base, meta)

    for (const step of meta.steps ?? []) {
      if (step.click) {
        await page.click(step.click)
        // Off the content, so no element keeps a real hover the other side lacks.
        await page.mouse.move(BASE_WIDTH - 1, HEIGHT - 1)
      }
      if (step.type) await page.fill(step.type[0], step.type[1])
      if (step.mode) await page.evaluate(m => window.__parityShell.setMode(m), step.mode)
      await page.waitForLoadState('networkidle')
      await settle(page)
      record.steps[step.name] = await snapshot(page)
    }
    record.hydration = await page.evaluate(() => window.__parityErrors)
    return record
  } finally {
    await page.close()
  }
}
