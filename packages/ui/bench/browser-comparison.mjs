// MeoNode against React in a real browser through Playwright, not jsdom.
//
// jsdom's DOM is slow enough to hide what a library adds, and its cost moves
// between jsdom versions, so the published comparison figures come from here.
// Four sides mount the same shape: React with a static className (the
// baseline), React with Emotion's css prop, MeoNode styled, and MeoNode
// setting the same className. The figure is the time a side adds per node over the baseline, in
// µs, which separates Emotion's cost from MeoNode's own. The update cases
// re-render a mounted component whose styled value changes on every render:
// rows whose colour flips, and a controlled input. A mount is timed
// whole, building the tree included: MeoNode does much of its work while
// building and in `.render()`, so timing only React's render and commit would
// leave that out, and would favour moving work out of React's render.
//
// Two app-shaped cases, MeoNode only, add what a page's first load meets: a
// cold mount on a fresh page (Emotion's sheet empty, the code not yet run),
// then warm mounts and updates on the same page. `app` is about 10k nodes with
// theme tokens, two providers and css unique to every node, whose update
// changes 30% of it; `flatThemed` is 10k styled spans under a provider.
//
// Every case is timed two ways. The JavaScript-only figure (`ms`, `addedUs*`)
// is building plus React's render and commit. The to-the-frame figure
// (`toFrame`) adds the browser's style, layout and paint of the first frame
// that shows the commit.
//
// Settings, from the environment:
// - `BENCH_BROWSER`: `headless` (default) runs Playwright's headless Chromium
//   shell, which needs `bunx playwright install chromium`; without it the
//   script prints why and exits 0, so `bun run bench` still runs elsewhere.
//   `chrome` runs the installed Google Chrome in a visible window with a fresh
//   temporary profile, and fails if Chrome is missing. Two more tell a
//   version difference from a headless one when those two disagree:
//   `chromium`, Playwright's full Chromium build in a window, the same version
//   as the shell; and `chrome-headless`, the installed Chrome with no window.
//   On macOS the windowed browsers open behind the app in front and never
//   take focus from it: the browser is started through `open -g` with no
//   window, and each page gets its own window, created in the background over
//   the DevTools protocol. The window is still on screen and its frames still
//   run, so the to-the-frame clock is unchanged. `BENCH_FOREGROUND=1` starts
//   it through Playwright instead, in front, as before. Headed figures from
//   before this background launch came from the foreground one; compare runs
//   of one launch method only.
// - `BENCH_DIST_B`: a second `@meonode/ui` dist directory. Its MeoNode sides
//   join the page as `meoStyledB` and `meoClassNameB`, and `variantB` reports
//   their time over the package's own build. Pointing it at `dist` itself
//   gives an A/A check: two copies of one build, which must agree.
// - `BENCH_LOAD_MAX`: the highest 1-minute load average a page may start at
//   before the run is marked invalid (default 10).
// - `ROUNDS`, `PAGES`, `FLAT`, `NESTED`, `ROWS`, `COLD_PAGES`, `WARM_ROUNDS`:
//   sample counts and sizes.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { loadavg, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, URL } from 'node:url'
import { median, report } from './_lib.mjs'

const { chromium } = await import('@playwright/test')

/**
 * Chromium throttles a page whose window is in the background or covered: its
 * timers, its frames and its renderer's priority. A visible window can still
 * be covered while the bench runs, so all three are turned off. A sample taken
 * while the page is hidden anyway is marked invalid and not counted.
 */
const NO_THROTTLING = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']

/** Exposes `gc()` to the page, which collects garbage before every sample so none is left over from the side before. */
const EXPOSE_GC = '--js-flags=--expose-gc'
const ARGS = [...NO_THROTTLING, EXPOSE_GC]

/**
 * Whether a windowed browser opens behind the app in front. A browser Playwright
 * launches itself activates over whatever the user is working in, on every
 * launch and every new page; on macOS it can be started without that.
 */
const IN_BACKGROUND = process.platform === 'darwin' && process.env.BENCH_FOREGROUND !== '1'

/** How long a background browser may take to start: a fresh profile's first start takes several seconds. */
const BACKGROUND_START_MS = 60_000

/**
 * Starts a windowed browser behind the app in front, with a fresh temporary
 * profile, and connects to it over the DevTools protocol.
 *
 * `open -g` starts the app without activating it, and `--no-startup-window`
 * keeps it from opening a window, which would activate it. Each page is a new
 * window in a context of its own, as `browser.newPage()` gives: the target is
 * created with `background: true`, which Playwright's own `newPage` does not
 * pass, and without which the browser comes to the front. Throttling stays off
 * through `ARGS`, so a window behind another runs its timers and frames as a
 * window in front does.
 * @param app What `open -a` takes: an app name or the path to its bundle.
 * @returns The browser, as far as this script uses one.
 */
async function launchInBackground(app) {
  const profile = mkdtempSync(join(tmpdir(), 'meonode-bench-browser-'))
  execFileSync('open', [
    '-g',
    '-n',
    '-a',
    app,
    '--args',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-startup-window',
    ...ARGS,
  ])
  // The browser writes the port it chose to this file once it listens.
  const portFile = join(profile, 'DevToolsActivePort')
  const deadline = Date.now() + BACKGROUND_START_MS
  while (!existsSync(portFile) || !readFileSync(portFile, 'utf8').includes('\n')) {
    if (Date.now() > deadline) throw new Error(`${app} did not start within ${BACKGROUND_START_MS} ms`)
    await sleep(100)
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${readFileSync(portFile, 'utf8').split('\n')[0]}`)
  const cdp = await browser.newBrowserCDPSession()
  return {
    inBackground: true,
    version: () => browser.version(),
    async newPage() {
      const known = new Set((await cdp.send('Target.getBrowserContexts')).browserContextIds)
      const context = await browser.newContext()
      const browserContextId = (await cdp.send('Target.getBrowserContexts')).browserContextIds.find(id => !known.has(id))
      const opened = context.waitForEvent('page')
      await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId, newWindow: true, background: true })
      const page = await opened
      page.once('close', () => context.close().catch(() => {}))
      return page
    },
    async close() {
      const disconnected = new Promise(done => browser.once('disconnected', done))
      await cdp.send('Browser.close').catch(() => {})
      await disconnected
      // The browser may still be writing its profile as it exits.
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    },
  }
}

/** The browsers `BENCH_BROWSER` selects. Each launch gets a fresh temporary profile. */
const BROWSERS = {
  headless: { name: 'chromium-headless-shell', launch: () => chromium.launch({ args: ARGS }) },
  chrome: {
    name: 'chrome',
    launch: () => (IN_BACKGROUND ? launchInBackground('Google Chrome') : chromium.launch({ channel: 'chrome', headless: false, args: ARGS })),
  },
  chromium: {
    name: 'chromium',
    // The app bundle that holds Playwright's Chromium executable.
    launch: () =>
      IN_BACKGROUND ? launchInBackground(chromium.executablePath().replace(/\.app\/.*$/, '.app')) : chromium.launch({ headless: false, args: ARGS }),
  },
  'chrome-headless': { name: 'chrome-headless', launch: () => chromium.launch({ channel: 'chrome', headless: true, args: ARGS }) },
}
const BROWSER = process.env.BENCH_BROWSER || 'headless'
if (!BROWSERS[BROWSER]) throw new Error(`BENCH_BROWSER must be one of ${Object.keys(BROWSERS).join(', ')}, not ${BROWSER}`)

if ((BROWSER === 'headless' || BROWSER === 'chromium') && !existsSync(chromium.executablePath())) {
  console.log('\nbrowser-comparison: skipped, no Chromium for Playwright here. Install it with `bunx playwright install chromium`.')
  process.exit(0)
}

const ROUNDS = Number(process.env.ROUNDS || 8)

/**
 * Fresh pages per case; each starts with a cold JIT, so their spread shows
 * run-to-run noise. With three, the spread could come out narrower than the
 * difference between two whole runs; five covered it.
 */
const PAGES = Number(process.env.PAGES || 5)
/** Fewest valid samples a side may have on a page, as a share of `ROUNDS`, before the run fails. */
const MIN_VALID_SHARE = 0.5
const SHAPES = [
  { shape: 'flat', n: Number(process.env.FLAT || 10000) },
  { shape: 'nested', n: Number(process.env.NESTED || 500) },
]
/** Updates that change a styled value on every render; `n` is what the added time is divided by. */
const UPDATE_CASES = [
  { kind: 'rows', n: Number(process.env.ROWS || 1000) },
  { kind: 'input', n: 1 },
]
/** The app-shaped cases, MeoNode only: `app` (about 10k nodes, tokens, two providers) and `flatThemed` (10k spans under a provider). */
const APP_KINDS = ['app', 'flatThemed']
/** Fresh pages per build for each app-shaped case; each page gives one cold sample. */
const COLD_PAGES = Number(process.env.COLD_PAGES || 15)
/** Warm rounds on each page after its cold mount. */
const WARM_ROUNDS = Number(process.env.WARM_ROUNDS || 8)

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const DIST_B = process.env.BENCH_DIST_B ? resolve(process.env.BENCH_DIST_B) : null
if (DIST_B && !existsSync(join(DIST_B, 'esm/main.js'))) throw new Error(`BENCH_DIST_B has no esm/main.js: ${DIST_B}`)

/**
 * The page is served from this origin, with the headers that make it
 * cross-origin isolated, which sharpens `performance.now()` from 100 µs to 5 µs.
 * Playwright answers the requests itself; nothing listens on the network.
 */
const ORIGIN = 'http://meonode-bench.localhost'
const ISOLATION_HEADERS = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }
const PAGE_HTML = '<!doctype html><html><head><script src="/page.js"></script></head><body></body></html>'

/**
 * Bundles the page. The entry is written under the package's
 * `node_modules/.cache`, with build B copied beside it, so the copy's imports
 * of React and Emotion resolve to the same modules as the page's own.
 */
function bundlePage() {
  const cacheRoot = join(PACKAGE, 'node_modules/.cache')
  mkdirSync(cacheRoot, { recursive: true })
  const dir = mkdtempSync(join(cacheRoot, 'meonode-bench-'))
  try {
    if (DIST_B) cpSync(DIST_B, join(dir, 'dist-b'), { recursive: true })
    const entry = join(dir, 'entry.mjs')
    writeFileSync(
      entry,
      [
        `import * as A from ${JSON.stringify(join(PACKAGE, 'dist/esm/main.js'))}`,
        DIST_B ? `import * as B from './dist-b/esm/main.js'` : '',
        `import { start } from ${JSON.stringify(fileURLToPath(new URL('./browser-comparison.page.mjs', import.meta.url)))}`,
        `start({ A, B: ${DIST_B ? 'B' : 'null'} })`,
      ].join('\n'),
    )
    const bundle = join(dir, 'page.js')
    // iife keeps the bundle's top-level names off `window`.
    execFileSync('bun', ['build', entry, '--outfile', bundle, '--target', 'browser', '--format', 'iife', '--define', 'process.env.NODE_ENV="production"'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    return readFileSync(bundle, 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const code = bundlePage()

/** Opens a fresh page with the bundle loaded, in front. */
async function openPage(browser) {
  const page = await browser.newPage()
  await page.route(`${ORIGIN}/**`, route =>
    route.fulfill(
      new URL(route.request().url()).pathname === '/page.js'
        ? { contentType: 'text/javascript', headers: ISOLATION_HEADERS, body: code }
        : { contentType: 'text/html', headers: ISOLATION_HEADERS, body: PAGE_HTML },
    ),
  )
  await page.goto(`${ORIGIN}/`)
  // Bringing a page to the front activates its browser; a background page is
  // alone in its window, so it is the tab shown there already.
  if (!browser.inBackground) await page.bringToFront()
  return page
}

/** Fails the run when a side has too few valid samples on any page. */
function requireValid(pages, label) {
  for (const [p, page] of pages.entries()) {
    for (const [side, result] of Object.entries(page)) {
      for (const [kind, counts] of [
        ['JavaScript-only', result.samples],
        ['to-the-frame', result.toFrame.samples],
      ]) {
        if (counts.valid < ROUNDS * MIN_VALID_SHARE) {
          throw new Error(`${label}, page ${p + 1}, ${side}: only ${counts.valid} of ${ROUNDS} ${kind} samples valid; the page was hidden`)
        }
      }
    }
  }
}

const sumCounts = counts => Object.fromEntries(Object.keys(counts[0]).map(key => [key, counts.reduce((total, count) => total + count[key], 0)]))

/**
 * Reads the figures of one case from its pages.
 * @param pages Per-page results of `runSides` or `runUpdates`.
 * @param n What the added time is divided by: nodes, levels or rows.
 * @param digits Decimals of the added time.
 */
function figures(pages, n, digits) {
  const sides = Object.keys(pages[0])
  const pick = (side, path) => pages.map(page => path.reduce((value, key) => value?.[key], page[side]))
  const ms = (side, path) => median(pick(side, path))
  const us = value => +value.toFixed(digits)
  const perUnit = ms => us((ms / n) * 1000)
  const added = (side, base, path) => perUnit(ms(side, path) - ms(base, path))
  const addedByPage = (side, base, path) => pick(side, path).map((value, p) => perUnit(value - pick(base, path)[p]))
  const perSide = fn => Object.fromEntries(sides.map(side => [side, fn(side)]))
  const overBaseline = path => ({
    meonodeClassName: added('meoClassName', 'reactClass', path),
    meonodeStyled: added('meoStyled', 'reactClass', path),
    emotionCssProp: added('reactEmotion', 'reactClass', path),
    meonodeOverEmotion: added('meoStyled', 'reactEmotion', path),
  })
  const variant = path =>
    sides.includes('meoStyledB')
      ? {
          meonodeStyled: added('meoStyledB', 'meoStyled', path),
          meonodeClassName: added('meoClassNameB', 'meoClassName', path),
          byPage: { meonodeStyled: addedByPage('meoStyledB', 'meoStyled', path), meonodeClassName: addedByPage('meoClassNameB', 'meoClassName', path) },
        }
      : undefined
  const sorted = (side, path, places) =>
    pick(side, path)
      .map(value => +value.toFixed(places))
      .sort((a, b) => a - b)
  /** Highest minus lowest per-page median of a side, per unit, in µs: the run-to-run spread. */
  const spread = (side, path) => perUnit(Math.max(...pick(side, path)) - Math.min(...pick(side, path)))
  return {
    ms,
    perSide,
    javaScriptOnly: places => ({
      added: overBaseline(['ms']),
      variantB: variant(['ms']),
      ms: perSide(side => sorted(side, ['ms'], places)),
      spreadUs: perSide(side => spread(side, ['ms'])),
    }),
    toFrame: {
      addedUs: overBaseline(['toFrame', 'ms']),
      variantB: variant(['toFrame', 'ms']),
      ms: perSide(side => sorted(side, ['toFrame', 'ms'], 3)),
      spreadUs: perSide(side => spread(side, ['toFrame', 'ms'])),
      overJavaScriptOnlyMs: perSide(side => +(ms(side, ['toFrame', 'ms']) - ms(side, ['ms'])).toFixed(3)),
      postCommitMs: perSide(side => +ms(side, ['toFrame', 'postCommitMs']).toFixed(3)),
      minPostCommitMs: perSide(side => +Math.min(...pick(side, ['toFrame', 'minPostCommitMs'])).toFixed(3)),
      maxLayoutLeftMs: perSide(side => +Math.max(...pick(side, ['toFrame', 'maxLayoutLeftMs'])).toFixed(3)),
      notAfterCommit: perSide(side => pick(side, ['toFrame', 'notAfterCommit']).reduce((a, b) => a + b, 0)),
    },
    samples: perSide(side => ({ javaScriptOnly: sumCounts(pick(side, ['samples'])), toFrame: sumCounts(pick(side, ['toFrame', 'samples'])) })),
  }
}

/**
 * Highest 1-minute load average at which a page may start. Above it, other
 * work competes for the CPU and the run is marked invalid. 10 is the
 * threshold the published figures were measured under, on a 14-core machine;
 * `BENCH_LOAD_MAX` sets another for other machines.
 */
const LOAD_MAX = Number(process.env.BENCH_LOAD_MAX || 10)
/** The 1-minute load average as each page started, in order. */
const pageLoads = []

const round2 = value => +value.toFixed(2)
const stats = values => (values.length ? { median: round2(median(values)), min: round2(Math.min(...values)), max: round2(Math.max(...values)) } : null)

/**
 * The figures of one app-shaped case: per build, the cold mount and update
 * (one per page) and the warm ones (each page's median), JavaScript only and to
 * the frame, as the median and range over pages, in ms; and build B's time
 * over build A's.
 * @param pagesBySide Per build, the `runApp` result of each page.
 */
function appFigures(pagesBySide) {
  const metrics = [
    ['coldMount', page => [page.cold.mount]],
    ['coldUpdate', page => (page.cold.update ? [page.cold.update] : [])],
    ['warmMount', page => page.warm.map(round => round.mount)],
    ['warmUpdate', page => page.warm.flatMap(round => (round.update ? [round.update] : []))],
  ]
  /** Each page's value, in page order, or null where the page has no valid sample. */
  const perPage = (pages, pick, key) =>
    pages.map(page => {
      const values = pick(page)
        .filter(sample => sample.valid)
        .map(sample => sample[key])
      return values.length ? round2(median(values)) : null
    })
  const present = values => values.filter(value => value !== null)
  const bySide = Object.fromEntries(
    Object.entries(pagesBySide).map(([side, pages]) => {
      const samples = pages.flatMap(page => [...metrics.flatMap(([, pick]) => pick(page))])
      return [
        side,
        {
          ...Object.fromEntries(
            metrics
              .filter(([, pick]) => pick(pages[0]).length)
              .map(([name, pick]) => [
                name,
                Object.fromEntries(
                  ['jsMs', 'toFrameMs'].map(key => {
                    const byPage = perPage(pages, pick, key)
                    return [key, { ...stats(present(byPage)), byPage }]
                  }),
                ),
              ]),
          ),
          samples: { valid: samples.filter(sample => sample.valid).length, invalid: samples.filter(sample => !sample.valid).length },
        },
      ]
    }),
  )
  const sides = Object.keys(bySide)
  const variantB = sides.includes('meonodeB')
    ? Object.fromEntries(
        Object.keys(bySide.meonode)
          .filter(name => name !== 'samples')
          .map(name => [
            name,
            Object.fromEntries(
              ['jsMs', 'toFrameMs'].map(key => {
                const a = bySide.meonode[name][key]
                const b = bySide.meonodeB[name][key]
                // Page p of each build ran back to back, so their difference is a pair.
                const byPage = a.byPage.map((value, p) => (value === null || b.byPage[p] === null ? null : round2(b.byPage[p] - value)))
                return [key, { diff: round2(b.median - a.median), spread: round2(Math.max(a.max - a.min, b.max - b.min)), byPage }]
              }),
            ),
          ]),
      )
    : undefined
  return { pages: pagesBySide[sides[0]].length, ...bySide, variantB }
}

/** Fails the run when an app-shaped case has fewer valid samples than {@link MIN_VALID_SHARE} of all. */
function requireValidApp(figures, label) {
  for (const [side, result] of Object.entries(figures)) {
    if (!result?.samples) continue
    const { valid, invalid } = result.samples
    if (valid < (valid + invalid) * MIN_VALID_SHARE)
      throw new Error(`${label}, ${side}: only ${valid} of ${valid + invalid} samples valid; the page was hidden`)
  }
}

const loadAtStart = loadavg()[0]
const browserChoice = BROWSERS[BROWSER]
const browser = await browserChoice.launch()
const browserVersion = browser.version()
let pageInfo
const results = {}
try {
  for (const { shape, n } of SHAPES) {
    const pages = []
    for (let p = 0; p < PAGES; p++) {
      pageLoads.push(+loadavg()[0].toFixed(2))
      const page = await openPage(browser)
      pageInfo ??= await page.evaluate(() => window.pageInfo())
      pages.push(await page.evaluate(options => window.runSides(options), { shape, n, rounds: ROUNDS }))
      await page.close()
    }
    requireValid(pages, shape)
    const f = figures(pages, n, 2)
    const js = f.javaScriptOnly(2)
    results[shape] = {
      nodes: n,
      addedUsPerNode: js.added,
      variantB: js.variantB,
      ms: js.ms,
      spreadUsPerNode: js.spreadUs,
      // The two phases of `ms`, for diagnosis: building the tree, then React's render and commit.
      phases: {
        buildMs: f.perSide(side => +f.ms(side, ['buildMs']).toFixed(3)),
        commitMs: f.perSide(side => +f.ms(side, ['commitMs']).toFixed(3)),
        commitOnlyAddedUsPerNode: {
          meonodeStyled: +(((f.ms('meoStyled', ['commitMs']) - f.ms('reactClass', ['commitMs'])) / n) * 1000).toFixed(2),
          meonodeOverEmotion: +(((f.ms('meoStyled', ['commitMs']) - f.ms('reactEmotion', ['commitMs'])) / n) * 1000).toFixed(2),
        },
      },
      toFrame: f.toFrame,
      samples: f.samples,
      fibersPerNode: f.perSide(side => pages[0][side].fibersPerNode),
      mountsPerSample: f.perSide(side => pages[0][side].mountsPerSample),
    }
  }
  for (const { kind, n } of UPDATE_CASES) {
    const pages = []
    for (let p = 0; p < PAGES; p++) {
      pageLoads.push(+loadavg()[0].toFixed(2))
      const page = await openPage(browser)
      pages.push(await page.evaluate(options => window.runUpdates(options), { kind, n, rounds: ROUNDS }))
      await page.close()
    }
    requireValid(pages, `update.${kind}`)
    const f = figures(pages, n, 3)
    const js = f.javaScriptOnly(4)
    results[`update.${kind}`] = {
      per: kind === 'rows' ? `row (${n} rows)` : 'update',
      addedUsPer: js.added,
      variantB: js.variantB,
      msPerUpdate: js.ms,
      spreadUsPer: js.spreadUs,
      toFrame: f.toFrame,
      samples: f.samples,
      updatesPerSample: f.perSide(side => pages[0][side].updatesPerSample),
    }
  }
  // One page per build per sample, so every cold mount is a page's first; the
  // two builds alternate which goes first.
  const appSides = DIST_B ? ['meonode', 'meonodeB'] : ['meonode']
  for (const kind of APP_KINDS) {
    const pagesBySide = Object.fromEntries(appSides.map(side => [side, []]))
    for (let p = 0; p < COLD_PAGES; p++) {
      for (const side of p % 2 ? [...appSides].reverse() : appSides) {
        pageLoads.push(+loadavg()[0].toFixed(2))
        const page = await openPage(browser)
        pagesBySide[side].push(await page.evaluate(options => window.runApp(options), { kind, side, rounds: WARM_ROUNDS }))
        await page.close()
      }
    }
    const figures = appFigures(pagesBySide)
    requireValidApp(figures, `cold.${kind}`)
    results[`cold.${kind}`] = figures
  }
} finally {
  await browser.close()
}

await report('browser-comparison', {
  browser: `${browserChoice.name} ${browserVersion}`,
  valid: pageLoads.every(load => load < LOAD_MAX),
  ...(pageLoads.every(load => load < LOAD_MAX)
    ? {}
    : {
        invalidBecause: `${pageLoads.filter(load => load >= LOAD_MAX).length} of ${pageLoads.length} pages started at a 1-minute load of ${LOAD_MAX} or more`,
      }),
  load1: { start: +loadAtStart.toFixed(2), end: +loadavg()[0].toFixed(2), max: LOAD_MAX, pages: pageLoads },
  crossOriginIsolated: pageInfo.crossOriginIsolated,
  gcBeforeSamples: pageInfo.gcBeforeSamples,
  timerResolutionMs: pageInfo.timerResolutionMs,
  buildB: Boolean(DIST_B),
  rounds: ROUNDS,
  pages: PAGES,
  coldPages: COLD_PAGES,
  warmRounds: WARM_ROUNDS,
  ...results,
  note: 'addedUsPerNode is the median time a side adds over React setting a static className, per node or nesting level, JavaScript only. A mount is the whole step: building the tree, then the render and commit. ms lists the per-page medians of the time per mount, lowest first; each sample timed mountsPerSample consecutive mounts. spreadUs* is the highest minus the lowest of those, per node, row or update. phases splits a mount into building and committing. update.* re-render a mounted component whose styled value changes every time (rows flip their colour; an input changes its value and border colour), and addedUsPer is the time per row or per update over the className side. toFrame times single mounts and updates from the start of a frame to the end of that frame’s style, layout and paint on the main thread. variantB is build B’s time over the package’s own build. Samples taken while the page was hidden are not counted. Every sample starts from a collected heap; garbage made inside a sample, and any collection during it, is counted. valid is false when a page started at a 1-minute load of load1.max or more. cold.* are MeoNode only (byPage lists each page’s value in page order; with BENCH_DIST_B, page p of each build ran back to back): app is about 10k nodes with theme tokens, two providers and css unique to every node, whose update changes the css of 30% of them; flatThemed is 10k styled spans under a provider. Each page gives one cold mount (and, for app, the update after it), its first, with Emotion’s sheet empty and the code not yet run, then warmRounds warm mounts and updates; figures are the median and range over pages, in ms.',
})
