# RSC differential

Compares what React Server Components render with two builds of `@meonode/ui`,
as a browser sees it. It exists to catch a change that restyles a page without
failing any test: a `theme.*` token left in an `@media` condition, a rule that no
longer reaches the page, a class that composes differently.

It uses a real `next build` and `next start`, not the vitest react-server layer.
That layer stubs every `'use client'` module, and before 3.1.0 a styled host tag
in a server component rendered through `StyledRenderer`, a client component, so
a stubbed graph renders nothing for the older side of the comparison.

## What it runs

- **`corpus.mjs`**: one server component per case, each marking the elements it
  measures with `data-probe`. Tokens in values, at-rule conditions and selectors;
  nested at-rules; every `css` shape; theme functions; host tags, `as`,
  `createNode`, `createChildrenFirstNode`, function components, `next/link`;
  `className` handed in; async, Suspense and `'use cache'`.
- **`fixture/`**: the Next app. Every case is mounted under four layouts:
  - `cp`: `ThemeProvider` in a `'use client'` component
  - `sp`: `ThemeProvider` called from a server layout
  - `np`: no provider
  - `cpd`: `cp`, rendered per request and streamed
- **Four builds:** `plain`, `cc` (Cache Components), and each of those compiled
  with `@meonode/compiler`.

For each probe, `run.mjs collect` reads the computed style in Chromium:
- in the served document with JavaScript off, at 1280 and 390 px
- under a real `:hover`
- after hydration

It also records:
- the probe's rules, and whether each rule's condition is valid
- `theme.` text or function source left in the served CSS
- console errors

A case that fails the build is left out of that route only, and the error is
recorded.

## Running it

```bash
export RSC_DIFF_WORK=/tmp/rsc-diff          # installs and builds; defaults to .work/
node run.mjs pack <git-ref>                 # prints a tarball versioned <v>-rscdiff.<sha>; `.` packs this checkout
node run.mjs all base 3.0.0                 # prepare, then build + collect every config
node run.mjs all head $RSC_DIFF_WORK/meonode-ui-<v>-rscdiff.<sha>.tgz
node compare.mjs $RSC_DIFF_WORK/base $RSC_DIFF_WORK/head --expect expected-differences.json
```

`pack` gives the tarball a version no registry has. A tarball whose version
matches a published one is installed from the registry instead of the file.

`compare.mjs` prints each case whose output differs, grouped by layout and by the
places it was read:
- **computed style** is the verdict
- **rule text** (class hashes relabelled), **token leaks** and **console lines**
  say why

`--rules` also prints every rule-text difference.

Routes are read in parallel. `RSC_DIFF_CONCURRENCY` sets the number of routes;
the default is half the cores, up to 8. Routes are independent, so the results
are the same as a sequential run.

## Expected differences

`compare.mjs --expect expected-differences.json` exits with:
- `1` for any difference the file does not list
- `2` when the comparison cannot be trusted, such as a config or a case
  collected on one side only
- `0` otherwise

Each entry names the `case`, why it differs (`change`) and what intends it
(`source`: a changeset or an issue). It can narrow the match with:
- `layouts`, `configs`
- `kind`: `style`, `leak`, `classes`, `build`, `rule-never-applies`,
  `console-added`, …
- `probe`, `property`, `from`, `to`

```json
{
  "baseline": "3.1.1",
  "differences": [
    {
      "case": "flex-defaults",
      "kind": "style",
      "property": "flex-shrink",
      "from": "0",
      "to": "1",
      "change": "flex: '1 1 auto' keeps its own shrink factor",
      "source": "#33"
    }
  ]
}
```

`baseline` is the release the entries are measured against. After that release
ships, its entries match nothing and are reported as such; remove them.

## In CI

`.github/workflows/rsc-differential.yml` compares the latest published
`@meonode/ui` with the checkout. It runs on pull requests touching
`packages/ui/src`, the package manifest or this directory, and nightly on
`main`. The baseline's results depend only on its version and the harness, so
they are cached under that key and collected once per release.

Measured on a 14-core machine, with warm package caches:
- whole baseline: 124 s
- packing the checkout: 4 s
- whole head: 134 s

For each of the four builds that is 6–45 s of `next build` and about 20 s to read
320 routes.

## Checking the instrument

Before trusting a result:
- compare a run with itself: it must report no differences
- collect one build twice: two runs of one build have matched apart from
  animation opacity, which is ignored
- confirm a known regression shows up, such as 3.0.0 against 3.1.0 for #39

A condition the browser cannot parse keeps its text in the CSSOM, so validity is
read with three-valued logic instead: for a valid condition, exactly one of `q`
and `not q` matches.
