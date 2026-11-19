# Benchmarks

Standalone node scripts, deliberately **not** vitest tests.

## Why not vitest

Every perf measurement problem this project has hit traced back to running
benchmarks under vitest:

| Symptom | Cause |
| --- | --- |
| The compiler's client-side gain mostly disappears | vitest forces `NODE_ENV=test`, so React resolves to its **development** build, whose validation overhead dominates |
| Metrics table invisible in CI logs | vitest intercepts `console` (needs `--disable-console-intercept`) |
| Memory assertions flip pass/fail between invocations | thresholds sit within noise, and results depend on which files share a worker |
| `--cpu-prof` captures nothing useful | vitest runs tests in forked workers |

`NODE_ENV=production` cannot simply be forced under vitest either — vite's
dev-server machinery fails with `Error: No such built-in module: node:`.

So the benchmarks live here and nowhere else. `tests/performance.test.ts` and
`tests/react-createelement-comparison.test.ts` have been removed; everything
they measured is covered by the scripts below.

## Running

```bash
NODE_ENV=production node bench/node-construction.mjs
NODE_ENV=production node bench/client-render.mjs
```

Or via the package scripts, which set `NODE_ENV` and `--expose-gc` for you:

```bash
bun run bench
```

Results print as tables. Pass `--json` for raw output when piping into other
tooling:

```bash
NODE_ENV=production node --expose-gc bench/node-construction.mjs --json
```

Profiling works normally, because these are ordinary node processes:

```bash
NODE_ENV=production node --cpu-prof --cpu-prof-dir=prof bench/client-render.mjs
```

## What each measures

- **`node-construction.mjs`** — construction, `processProps`, and stable-key
  work only. No React, no Emotion, no DOM. This is the *upper bound* on what
  compiling can buy, not a page-level number.
- **`client-render.mjs`** — mount plus re-renders through React and jsdom.
  Closest to what a user experiences. Matters specifically because
  `_getStableKey` returns early when `isServer`, so `__meo$k` is only ever
  consumed on the client — SSR benchmarks never exercised it at all. It renders
  the tree twice over: once with plain values, and once, under the `tokens` rows,
  with a theme token in every style value inside a component under a
  `ThemeProvider`, which adds the token rewrite an uncompiled call site runs on
  every render.
- **`large-trees.mjs`** — a realistic page layout, 10k flat nodes, nesting
  timed at 500 levels, and a stack-safety check. The nested figure is the time
  MeoNode adds per level over React putting a static className on each level:
  deeper chains mostly time jsdom, whose insertion into a detached parent walks
  the whole inserted subtree, and both sides pay that. The stack-safety check
  mounts 10k levels of styled nesting and reports only pass/fail. `render()`
  walks iteratively, but React's commit phase recurses once per fiber and a
  styled node is three fibers deep, so the check mounts in a worker thread
  given a 64 MB stack (`runWithDeepStack` in `_lib.mjs`). An overflow there
  throws `RangeError` and the script exits non-zero; raising `--stack-size` on
  the main thread instead can crash the process with SIGSEGV.
- **`react-comparison.mjs`** — against raw `React.createElement`, in jsdom, for
  diagnosis. Two pairs: no props on either side, and React's static className
  against one MeoNode style property, so both sides put one class on every
  element. It reports the time MeoNode adds per node, not a ratio: a ratio
  moves with the DOM's share of the work, which changes between jsdom versions.
- **`browser-comparison.mjs`** — the published comparison, in a real browser
  through Playwright. Four sides mount 10k flat nodes and 500 nested levels:
  React with a static className (the baseline, `reactClass`), React with
  Emotion's css prop (`reactEmotion`), MeoNode styled (`meoStyled`, one style
  prop on every node), and MeoNode setting the baseline's static className on
  every node, with no CSS-in-JS (`meoClassName`). It reports the time
  each side adds per node over the baseline, which separates Emotion's cost
  from MeoNode's own, and the fibers each side renders per node. Two update
  cases re-render a mounted component whose styled value changes on every
  render, as a conditional colour or a controlled input does: 1k rows that flip
  their colour, and an input whose value and border colour change. They report
  the time added per row, or per update, over the className side.

  Every case is timed two ways. The JavaScript-only figures (`ms`,
  `addedUs*`) are building plus React's render and commit. The `toFrame`
  figures time single mounts and updates from the start of a frame to the end
  of that frame's style, layout and paint on the main thread; raster and GPU
  presentation are not included. A stylesheet gives the className sides the
  same styles the styled sides write, so every side pays for the same layout.
  The flat shape is laid out as rows, one block per node, as a list renders.
  Inline spans with no space between them form one unbroken word, whose layout
  grows with the square of the node count: React's frame took 48.7 ms at 5k
  nodes and 185 ms at 10k that way, against 10.6 and 19.9 ms as rows.

  Two app-shaped cases, MeoNode only, time what a page's first load meets as
  well as later renders. `app` is about 10k nodes, 31 levels deep with a
  component every 3 levels, a ThemeProvider at the root and one inner
  provider, theme tokens, and css unique to every node; its update changes the
  css of 30% of the nodes. `flatThemed` is 10k styled spans under a provider.
  Each fresh page gives one cold mount, its first, with Emotion's sheet empty
  and the code not yet run (and for `app`, the update after it), then
  `WARM_ROUNDS` warm mounts and updates. They report the median and range over
  `COLD_PAGES` pages, in ms, JavaScript only and to the frame. The tree is in
  `browser-comparison.app.mjs`.

  `BENCH_BROWSER=chrome` runs the installed Google Chrome in a visible window
  with a fresh temporary profile; the default, `headless`, runs Playwright's
  headless Chromium shell. Both turn off background throttling, and a sample
  taken while the page was hidden is not counted. Headless and headed agree,
  within one Chrome version, on every case but the controlled input: headless
  times its update about 0.6 µs slower for MeoNode styled (less for the other
  sides), in both Chrome 158 and Chromium 159. So input figures come from
  headed Chrome only. Every round runs the sides
  in a different shuffled order, and garbage is collected before every
  sample: with a fixed order each side always followed the same side and paid
  for its garbage, which showed up as a steady offset between two copies of one
  build. So every sample starts from a collected heap, and the garbage a side
  makes inside a sample, with any collection during it, is still counted. The
  1-minute load average is read as each page starts; if one starts at 10 or
  more (`BENCH_LOAD_MAX`), the report marks the run `valid: false`. The page is cross-origin
  isolated, so `performance.now()` steps by 5 µs. `BENCH_DIST_B=<dist>` adds a
  second `@meonode/ui` build as `meoStyledB` and `meoClassNameB`, reported in
  `variantB` against the package's own build; `BENCH_DIST_B=dist` is an A/A
  check, two copies of one build that must agree within the spread. The report
  records the browser and its version, and the 1-minute load average at the
  start and end. The page code is `browser-comparison.page.mjs`, bundled with
  `bun build`. Without Playwright's Chromium (`bunx playwright install
  chromium`) the headless run prints why and exits 0.
- **`memory.mjs`** — heap growth across state churn, mount/unmount cycles and
  navigation. Threshold checks rather than timings; exits non-zero on a
  regression, so it is still usable as a gate you run deliberately. Requires
  `--expose-gc`, and refuses to run without it, since otherwise the readings
  include uncollected garbage.

For end-to-end SSR, see `e2e/bench-theme-tokens.mjs` in the `@meonode/compiler`
repo, which drives the real wasm plugin at the docs site's token density.

## Conventions

A timed mount is the whole step a page pays: building the tree (MeoNode's
construction and `.render()`, or React's `createElement` calls), then React's
render and commit. MeoNode does much of its work while building, so timing only
the commit would leave that out. `browser-comparison` also reports the two
phases separately in `phases`, for diagnosis.

The comparisons alternate their variants and report medians. Measuring one order
only charges the second variant for the first's accumulated heap — that bias
once swung a re-render ratio between 1.16 and 0.50 across runs.

The jsdom scripts abort loudly rather than reporting a number if something is wrong: a
missing `history` global once made every node construction throw, and the
benchmark quietly measured exception handling instead of rendering.
