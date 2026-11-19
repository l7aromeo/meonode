// MeoNode against React in a real browser: headless Chromium through
// Playwright, not jsdom.
//
// jsdom's DOM is slow enough to hide what a library adds, and its cost moves
// between jsdom versions, so the published comparison figures come from here.
// Four sides mount the same shape: React with a static className (the
// baseline), React with Emotion's css prop, MeoNode styled, and MeoNode
// unstyled. The figure is the time a side adds per node over the baseline, in
// µs, which separates Emotion's cost from MeoNode's own.
//
// Needs Playwright's Chromium (`bunx playwright install chromium`). Without it
// the script prints why and exits 0, so `bun run bench` still runs elsewhere.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { median, report } from './_lib.mjs'

const { chromium } = await import('@playwright/test')

if (!existsSync(chromium.executablePath())) {
  console.log('\nbrowser-comparison: skipped, no Chromium for Playwright here. Install it with `bunx playwright install chromium`.')
  process.exit(0)
}

const ROUNDS = Number(process.env.ROUNDS || 8)
/** Fresh pages per shape; each starts with a cold JIT, so their spread shows run-to-run noise. */
const PAGES = Number(process.env.PAGES || 3)
const SHAPES = [
  { shape: 'flat', n: Number(process.env.FLAT || 10000) },
  { shape: 'nested', n: Number(process.env.NESTED || 500) },
]

const outDir = mkdtempSync(join(tmpdir(), 'meonode-bench-'))
const bundle = join(outDir, 'page.js')
// iife keeps the bundle's top-level names off `window`.
execFileSync(
  'bun',
  [
    'build',
    fileURLToPath(new URL('./browser-comparison.page.mjs', import.meta.url)),
    '--outfile',
    bundle,
    '--target',
    'browser',
    '--format',
    'iife',
    '--define',
    'process.env.NODE_ENV="production"',
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
)
const code = readFileSync(bundle, 'utf8')
rmSync(outDir, { recursive: true, force: true })

const browser = await chromium.launch()
const results = {}
try {
  for (const { shape, n } of SHAPES) {
    const pages = []
    for (let p = 0; p < PAGES; p++) {
      const page = await browser.newPage()
      await page.setContent('<!doctype html><html><head></head><body></body></html>')
      await page.addScriptTag({ content: code })
      pages.push(await page.evaluate(options => window.runSides(options), { shape, n, rounds: ROUNDS }))
      await page.close()
    }
    const ms = side => median(pages.map(page => page[side].ms))
    const spread = side => pages.map(page => +page[side].ms.toFixed(2)).sort((a, b) => a - b)
    const addedUs = (side, base) => +(((ms(side) - ms(base)) / n) * 1000).toFixed(2)
    results[shape] = {
      nodes: n,
      addedUsPerNode: {
        meonodeUnstyled: addedUs('meoUnstyled', 'reactClass'),
        meonodeStyled: addedUs('meoStyled', 'reactClass'),
        emotionCssProp: addedUs('reactEmotion', 'reactClass'),
        meonodeOverEmotion: addedUs('meoStyled', 'reactEmotion'),
      },
      ms: Object.fromEntries(Object.keys(pages[0]).map(side => [side, spread(side)])),
      fibersPerNode: Object.fromEntries(Object.keys(pages[0]).map(side => [side, pages[0][side].fibersPerNode])),
    }
  }
} finally {
  await browser.close()
}

await report('browser-comparison', {
  browser: `chromium ${browser.version()}`,
  rounds: ROUNDS,
  pages: PAGES,
  ...results,
  note: 'addedUsPerNode is the median time a side adds over React setting a static className, per node or nesting level. ms lists the per-page medians, lowest first.',
})
