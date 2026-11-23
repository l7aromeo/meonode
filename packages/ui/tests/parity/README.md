# Styling parity suite

Checks that compiling with CSS extraction changes nothing a user can see. Every
corpus case renders on three sides:

- **runtime**: no compiler, today's runtime path. This is the oracle.
- **off**: through the SWC plugin with `experimental_extractCss: false`.
- **on**: through the SWC plugin with `experimental_extractCss: true`.

Each case is server-rendered, then hydrated in a headless browser, so nothing
takes focus: installed Chrome by default, or Playwright's WebKit or Firefox. It
is rendered in two server modes:

- **plain**: react-dom/server with no registry, so the server css cache path;
- **registry**: under `StyleRegistry`, with Next's inserted-HTML context.

Besides each side against the oracle in its own mode, the registry check
compares the oracle's [registry] record with its own [plain] one, the
per-node server render Emotion writes (row side `runtime-modes`). A registry
changes only where server styles are written, never what they do, so a
difference there is a registry defect, which a [registry] row cannot see when
the oracle and the compared side share it (a joined `<style>` in which one
rule's unclosed `(` swallows the rules after it, for instance). An expected
difference names it with the side `runtime-modes`.

Each server render, one case in one mode on one side, runs in a process of
its own, as a fresh server's first request: a module-level store, such as an
Emotion cache a case creates and the names it has inserted, would otherwise
carry from one render to the next and leave the later one without its
styles. `ssr.mjs` refuses a second render in the same process. The renders
run side by side, as many as the machine has cores.

A case can instead render on the client only, stream its server render, or be
a server component: rendered through Flight on the React Server Components
layer against the side's rsc build, then server-rendered from that payload and
hydrated from it, as Next does. Each side has its own copy of the
`@meonode/mui` build, importing that side's `@meonode/ui`.

Each side's record is compared with the oracle's on:

- **server HTML**, without style and script elements, class names, `--mv-*`
  inline variables and React's empty `<!-- -->` text separators;
- **hydration errors** (React's `onRecoverableError`), and console errors and
  warnings the oracle does not have;
- **the element tree**, ignoring the same things;
- **the computed style** of every element and of its `::before`, `::after` and
  `::selection` (and `::placeholder` for inputs and text areas), every property
  but the `--mv-*` variables;
- **forced `:hover`, `:focus`, `:focus-visible` and `:active`** on each element,
  reading every element while one is forced. Chromium forces them through the
  DevTools protocol; WebKit and Firefox through real input (the pointer over
  the element, pressed there for `:active` and released away from it so
  nothing is clicked, focus after a click, focus after a key press),
  which `PARITY_FORCE=input` also selects in Chromium. Between states the
  pointer rests on a blank square of the harness's own pinned to the
  viewport's corner, so it never rests on page content however far the page
  has scrolled. The pointer goes to the element's centre measured just
  before the move, since focusing an element can scroll the page and leave
  an earlier measure on a neighbour. A read under `:hover` or `:active` waits
  until the element matches the state, since real input takes effect on the
  engine's own frame. A read counts as a sample of its state only when no
  other compared element matches `:hover` besides the element's own
  ancestors and descendants; a DOM-state or step read, with the pointer on
  the square, fails the page if any compared element still matches it, and
  names the element. In WebKit an element can match `:hover` before its
  hover rules apply, on no fixed element and with every read holding the
  state: on grammar-101's 192 forced states, three sweeps of one page
  disagree on 0 to 6 states per side (6 runs, load average 3.7 to 7.6).
  Releasing the press over the element instead raised that to 6 to 40 over
  12 runs, so the press is released away from it. The repeated sweeps below
  decide these like any other difference. Real input does not take effect the same way in every session
  (a page's own scripts answer it on their own timing, and an element a hover
  moves can leave the pointer), so a forced-state difference under real input
  is decided by three more whole sweeps of the oracle, the "off" side and the
  compared page, each in a fresh session along the same pointer path. It is
  left out of the row as unstable when the oracle's or the "off" side's
  sweeps disagree among themselves, since neither has extraction, and as an
  outlier, listed under its own heading with the per-page sweep counts, the
  1-minute load average and the time, when every sweep of the compared page
  reads what the oracle's do. Otherwise it stays a failure: the compared
  page's sweeps reproduce it every time, or only sometimes, which may be
  extraction introducing a race (kept in `PARITY_REPORT` as `onlyCompared`,
  with the load and the time). Four fresh loads of each page, each reading
  the state alone, are kept as evidence (`reloadCounts`); a difference that
  shows only after the pointer has crossed earlier elements reproduces in
  the sweeps and on no fresh load. Three
  plants prove these outcomes: a difference on every load, one on alternate
  loads of the compared page only, and one that shows only after the pointer
  has crossed earlier elements, which runs only where states are forced
  through real input, since the DevTools protocol moves no pointer. `:checked`, `:disabled`
  and `:placeholder-shown` are flipped through the DOM on the elements that
  have them, in every engine;
- **every viewport width** at 1280px and at each breakpoint of the case ±1px,
  `prefers-color-scheme` light and dark, and both theme modes, plus
  `prefers-reduced-motion: reduce` for a case that sets `reducedMotion`;
- **each step** of the case's state script;
- **identity across each step:** which elements the step kept and which it
  mounted anew. A side that remounts a subtree the oracle keeps loses that
  subtree's state (an input's typed value, a component's own state), with its
  tree and styles equal, so only this shows it;
- **rule text**, "off" against "on": the rules the server CSS sets for every
  selector beyond an element's own class, every rule inside an at-rule (the
  element's own class included, so vendor-prefixed pairs there are compared),
  at-rules' own descriptors and statement at-rules, read with stylis's parser
  one style element at a time, as a browser reads each as a sheet of its own
  (so `@import`, `@charset` and `@namespace` after a rule set nothing), with
  class names normalised. This is the check for a selector or at-rule
  the browser under test drops, whose computed style cannot differ;
- **exact markup**, for elements a case marks `data-parity-exact`: their
  markup with class names, and the text of every rule naming those classes,
  "on" against "off" exactly. These are nodes that must render as the same call
  site with extraction off.

CSS transitions are run to their end before every read, so a read sees the
state a user sees once a change has played out. Animations and transitions on
elements inside one marked `data-parity-sample="<ms>"` are paused at that time
instead, so a read sees one fixed frame of them (a `@starting-style`
transition, a running `@keyframes` animation).

## Run

At the repository root, build the package, the compiler and the mui package first:

```bash
bun run build:ui
```

```bash
bun run build:compiler
```

```bash
bun run build:mui
```

Then, in packages/ui:

```bash
bun run test:parity
```

```bash
bun run test:parity:plants
```

`test:parity` compares every case. `test:parity:plants` plants one wrong rule,
attribute or text per dimension on the compared side (one per pseudo-class for
forced states), and fails unless each is caught in its own dimension. A
dimension counts only after its plant is caught. It also plants compiler bugs:
each rewrites the "on" side's compiled output of one case (a selector list in
the registered rule text cut to its first selector, or the carrier marks
stripped, for instance), and must show a difference from the oracle that the
unrewritten output does not. A compiled plant with `noDifference` pins a
rewrite the browser cannot see, with its reason: the mark stripped from a
themed carrier, which the runtime makes a carrier on every render anyway. It
must change the output and show no difference. The registry check has a plant of its own: an
unclosed `(` ahead of the registry's joined styles on the [registry] page of
both the oracle and the "off" side, which their own row reads as the same and
the registry check must catch.

The browser phase waits until the 1-minute load average is under 10.

Settings, from the environment:

- `PARITY_WASM`: the compiler wasm. Default: `packages/compiler/npm/meonode_swc_plugin.wasm`.
- `PARITY_ON_UI`: a packages/ui directory whose built `dist` the "on" side uses.
  Default: this package.
- `PARITY_ON_OPTIONS`: the plugin options of the "on" side, as JSON.
- `PARITY_SIDES`: the sides compared with the oracle. Default: `off,on`.
- `PARITY_LOAD_MAX`: the load average the browser phase waits under.
- `PARITY_BROWSER`: `chromium` (the default), `webkit` or `firefox`.
- `PARITY_FORCE`: `input`, to force pseudo-classes through real input in
  Chromium too.
- `PARITY_DETAIL`: how many differences to print per failing comparison.
- `PARITY_REPORT`: a file to write every difference and each case's time in
  the browser phase to, as JSON, with `phases`: the milliseconds each phase
  took over the run (`totals`), per side's build (`build`: build, rsc, ssr)
  and per row (`rows`: each case, mode and side, with load, environments,
  forced, steps, first paint, compare, confirm sweeps and confirm reloads).
  Every run also logs the totals, with the wall time, as `time by phase`.
- `PARITY_SHARD`: `k/n`, to run only the k-th of n interleaved slices of the
  cases, so CI can run one engine as n jobs. A shard skips the coverage gate;
  a `--no-browser` run checks it for every case.
- `--case=<name>`: one case only, without the coverage gate.
- `--plant=<text>[,<text>…]`: with `--plants`, only the plants whose name (or, unnamed, dimension) holds one of the texts, for checking a few plants; such a run proves no dimension whole.
- `--sweep-aa=<n>`: with `--case`, compare nothing; sweep each case's real-input forced states n times on every side, each in a fresh session, and print how many states each side's own sweeps disagree on, which reads did not hold their state, and every other element found hovered, which should be none: the sweep's own noise.
- `--read-forced=<case>@<state>[;…]`: with `--case`, compare nothing; read each forced state (`<element index>:<state>`) on fresh loads of every side, `PARITY_READ_LOADS` of them (default 10), and print how many loads of each side read it differently from that side's most common read, to tell an engine's flake from one only the compiled side has.
- `--no-browser`: stop after the build, the coverage gate and the routing
  checks.

Against the compiler and runtime under development, point the "on" side at
their builds:

```bash
PARITY_WASM=<compiler wasm> PARITY_ON_UI=<packages/ui with a built dist> bun run test:parity
```

Point `PARITY_WASM` at a copy named by its hash rather than at a build output
another process may replace, so one run compiles every side with one wasm.

## Corpus

Each case is a module in `corpus/` named `<name>.case.ts`. It exports:

- `meta`: a `CaseMeta` (case.ts) with the styling shapes the case uses and the
  compiler routes its css entries take, from `inventory.mjs`;
- `App`: a component.

A case may import modules from `corpus/parts/`, compiled the same way, so a
case can span modules (and set their evaluation order by its imports).

A case may set compiler options of its own with a first line
`// parity-compiler-options: <JSON>`, such as `{"factoryModules":["@meonode/mui"]}`.
They are merged over each compiled side's options.

`meta` may also give:

- `breakpoints`, checked at −1, 0 and +1px;
- `steps`, its state script;
- `forceCombos`, pseudo-classes forced together (`['hover', 'focus-within']`),
  and `force: 'marked'`, to force only elements marked `data-parity-force`;
- `selectors` and `atrules`, the inventory entries it exercises;
- `reducedMotion`, to also record the base environment with
  `prefers-reduced-motion: reduce`;
- `pageCss`, a stylesheet of its own in the head, as a site's CSS;
- `customProps`, custom properties read on every element beside the standard
  properties, since engines do not all list custom properties in computed
  style;
- `forceScope: 'fixture'`, so a read while one element is forced covers only
  the `data-parity-scope` element around it; `environments: 'base'`, to
  record only the light colour scheme and theme mode; and
  `serverModes: ['plain']`, to skip the Next.js registry render (the
  generated grammar pages use all three);
- `render`: `client` for a client render with no server HTML, or `stream` for a
  streamed server render.

- `routing`: named nodes (by their `key`) with the route each proves and the
  properties that must stay in the call (`runtime`) or leave it for extracted
  rules (`extracted`); `whole` asserts the node carries no extracted classes
  or variables at all;
- `expected`: differences from the oracle that are known and recorded, each
  with its reason, sides, dimension and text, and optionally the server modes
  and the engines it appears in. A recorded difference that does not appear on
  a side, mode and engine it names fails the run, so a fix or a change shows;
  on an engine it does not name it excuses nothing.

The run fails when a shape or a route in `inventory.mjs` has no case, or when a
route is not proven on a node by some case's `routing`. The routes are the
compiler's, and each says what happens to a whole node: named (`__meo$n`),
named with a theme token left in an at-rule prelude, a carrier (named or
templated, and marked `__meo$r` to insert the run of named rules that starts
with it), templated (`__meo$t`), a factory call whose defaults were merged at
build time (`__meo$i`), a call of an imported factory joined at run time
(`__meoFactoryCall`), or one route per reason the compiler leaves a node or a
module on the runtime path. A case's routes and `routing` are derived from the
compiler's rules for its source, never read off its output.

Once some "on" output carries an extraction marker, the run also checks the
"on" output itself:

- a case tagged with an extracted route must carry a marker;
- a case tagged only with runtime routes must carry none;
- every routed node must carry the markers its route requires and none it
  rules out, and the carrier mark exactly when its route is CARRIER or its
  claim says `carrier: true` (a themed or merged carrier keeps its route);
- every class name a node carries must be registered with rule text, and
  every template it fills with text.

The check has plants of its own, each a rewrite of one case's "on" output
that it must fail while the unrewritten output passes: the output of a build
with extraction off, the names stripped, the names kept with their rules
emptied, the carrier marks stripped or put on every named node, the mark
stripped from a plain, a themed and a merged carrier or put on a themed and a
merged node that is none, and the joined calls made plain calls. The strip
plants' host, `identity-marked-routes`, places each carrier after a component
on some renders and after a rule on others, so the compiler marks it whatever
its route.

## Selector inventory

`selectors.mjs` lists every selector `@webref/css` names (pseudo-classes,
pseudo-elements and combinators) and the forms it does not (attribute
operators, `*`, ids, types and vendor pseudos), each with the css key a case
writes it as and the element it styles. `generate.mjs` writes one node per
entry into `corpus/generated/` (not committed) at the start of every run. The
run fails when webref names a selector the inventory lacks. In the browser
phase it prints the inventory selectors the engine under test does not
support; for those, the rule-text comparison is the check.

## Selector grammar

`grammar.mjs` writes the compiler's selector grammar
(`packages/compiler/tests/selector-grammar.ts`, which the compiler's selector
differential reads too, so the two cannot drift) as generated pages, 48 cases
each. Each case's css sits on one node in a fixed fixture: light and dark
ancestors, an ancestor with a comma in an attribute, siblings before and
after, a twin beside it for `& + &`, and children with the classes the
grammar names. Pseudo-classes are forced on the styled node only, and a step
flips the values the grammar reads at run time.

## At-rule inventory

`atrules.mjs` lists every at-rule `@webref/css` names, each with the css key
and value a case writes it as, the declarations its node needs beside it for
the at-rule to show (a font family using a `@font-face`, an animation using a
`@keyframes`), and a stylesheet probe. `generate.mjs` writes each entry at
three depths: at the top of a node's css, inside a selector block, and inside
another at-rule. The run fails when webref names an at-rule the inventory
lacks. In the browser phase it prints the inventory at-rules the engine under
test does not keep when it parses a stylesheet holding them; for those, the
rule-text comparison is the check.

## Not covered yet

- **Development builds,** and generated cases with shrinking.
- **The planted compiler bugs** from the design (wrong bucket order, a dropped
  shadow list, a wrong unit, a wrong token variable, truncated names).
- **Custom properties on elements other than the first:** the computed
  property list is read from the first element, so a custom property only
  another element carries is not compared there; the properties it feeds are.
