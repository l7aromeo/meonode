// Loads one case of one side in the browser and records everything the parity
// comparison checks: the element tree, every element's computed style and its
// ::before/::after, forced pseudo-class states, each viewport, colour scheme
// and theme mode, each state step, and hydration errors.
//
// readTree, readStyles and settle run in the page, so they use its globals.
/* global Node, getComputedStyle, requestAnimationFrame */

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
 * ::before and ::after, as arrays of values over one property list.
 */
function readStyles(skipped) {
  const elements = [...document.querySelectorAll('#root *')].filter(el => !skipped.includes(el.tagName))
  const first = elements.length ? getComputedStyle(elements[0]) : getComputedStyle(document.body)
  const props = [...first].sort()
  const values = cs => props.map(p => cs.getPropertyValue(p))
  return {
    props,
    paths: elements.map(el => {
      const path = []
      for (let e = el; e && e.id !== 'root'; e = e.parentElement) path.unshift(`${e.tagName.toLowerCase()}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`)
      return path.join(' > ')
    }),
    elements: elements.map(el => [values(getComputedStyle(el)), values(getComputedStyle(el, '::before')), values(getComputedStyle(el, '::after'))]),
  }
}

/** Waits for two frames, so effects and style recalculation have run. */
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

/** One full snapshot: tree and styles. */
const snapshot = async page => ({ tree: await page.evaluate(readTree, SKIPPED_TAGS), styles: await page.evaluate(readStyles, SKIPPED_TAGS) })

/**
 * For each compared element and each forced pseudo-class, the properties of any
 * element whose computed value differs from the unforced state.
 * @returns Entries `<element index>:<state>` → `{ <element index>/<part>/<prop>: value }`.
 */
async function forcedStates(page, base) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#root *' })
  const kept = await page.evaluate(skipped => [...document.querySelectorAll('#root *')].map(el => !skipped.includes(el.tagName)), SKIPPED_TAGS)
  const ids = nodeIds.filter((_, i) => kept[i])
  const out = {}
  for (const [index, nodeId] of ids.entries()) {
    for (const state of FORCED_STATES) {
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] })
      const now = await page.evaluate(readStyles, SKIPPED_TAGS)
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
      const changed = {}
      now.elements.forEach((parts, e) =>
        parts.forEach((vals, part) =>
          vals.forEach((v, p) => {
            if (v !== base.elements[e]?.[part]?.[p]) changed[`${e}/${part}/${now.props[p]}`] = v
          }),
        ),
      )
      out[`${index}:${state}`] = changed
    }
  }
  await cdp.detach()
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
    await settle(page)
    if (plant) await plant(page)
    await settle(page)
    const record = { console: messages, hydration: await page.evaluate(() => window.__parityErrors), envs: {}, forced: {}, steps: {} }

    const widths = [BASE_WIDTH, ...(meta.breakpoints ?? []).flatMap(b => [b - 1, b, b + 1])]
    for (const width of widths) {
      for (const scheme of ['light', 'dark']) {
        for (const mode of ['light', 'dark']) {
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
    await settle(page)
    const base = await page.evaluate(readStyles, SKIPPED_TAGS)
    record.forced = await forcedStates(page, base)

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
