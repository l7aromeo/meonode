# Styling parity suite

Checks that compiling with CSS extraction changes nothing a user can see. Every
corpus case renders on three sides:

- **runtime**: no compiler, today's runtime path. This is the oracle.
- **off**: through the SWC plugin with `experimental_extractCss: false`.
- **on**: through the SWC plugin with `experimental_extractCss: true`.

Each case is server-rendered, then hydrated in installed Chrome with no window,
so nothing takes focus. It is rendered in two server modes:

- **plain**: react-dom/server with no registry, so the server css cache path;
- **registry**: under `StyleRegistry`, with Next's inserted-HTML context.

Each side's record is compared with the oracle's on:

- **server HTML**, without style and script elements, class names and `--mv-*`
  inline variables;
- **hydration errors** (React's `onRecoverableError`), and console errors and
  warnings the oracle does not have;
- **the element tree**, ignoring the same things;
- **the computed style** of every element and of its `::before` and `::after`,
  every property;
- **forced `:hover`, `:focus`, `:focus-visible` and `:active`** on each element,
  through the DevTools protocol, reading every element while one is forced;
- **every viewport width** at 1280px and at each breakpoint of the case ±1px,
  `prefers-color-scheme` light and dark, and both theme modes;
- **each step** of the case's state script.

## Run

At the repository root, build the package and the compiler first:

```bash
bun run build:ui
```

```bash
bun run build:compiler
```

Then, in packages/ui:

```bash
bun run test:parity
```

```bash
bun run test:parity:plants
```

`test:parity` compares every case. `test:parity:plants` plants one wrong rule,
attribute or text per dimension on the compared side, and fails unless each is
caught in its own dimension. A dimension counts only after its plant is caught.

The browser phase waits until the 1-minute load average is under 10.

Settings, from the environment:

- `PARITY_WASM`: the compiler wasm. Default: `packages/compiler/npm/meonode_swc_plugin.wasm`.
- `PARITY_ON_UI`: a packages/ui directory whose built `dist` the "on" side uses.
  Default: this package.
- `PARITY_ON_OPTIONS`: the plugin options of the "on" side, as JSON.
- `PARITY_SIDES`: the sides compared with the oracle. Default: `off,on`.
- `PARITY_LOAD_MAX`: the load average the browser phase waits under.
- `--case=<name>`: one case only, without the coverage gate.

## Corpus

Each case is a module in `corpus/` named `<name>.case.ts`. It exports:

- `meta`: a `CaseMeta` (case.ts) with the styling shapes the case uses and the
  compiler routes its css entries take, from `inventory.mjs`;
- `App`: a component.

`meta` may also give:

- `breakpoints`, checked at −1, 0 and +1px;
- `steps`, its state script;
- `render`: `client` for a client render with no server HTML, or `stream` for a
  streamed server render.

The run fails when a shape or a route in `inventory.mjs` has no case. It also
fails when the "on" output of a case tagged with an extracted route carries no
extraction marker, unless `meta.leftOnRuntime` names the entries the compiler
leaves on the runtime path. That check runs only once some output carries a
marker.

## Not covered yet

- **`place.mui`:** an `@meonode/mui` component. Its dist imports `@meonode/ui`
  itself, so each side needs its own copy of it.
- **`env.rsc`:** a server-component render, through a Flight render as
  tests/flight does.
- **WebKit and Firefox:** they need Playwright browsers in the shared cache,
  which needs the user's approval.
- **Development builds,** and generated cases with shrinking.
- **The planted compiler bugs** from the design (wrong bucket order, a dropped
  shadow list, a wrong unit, a wrong token variable, truncated names). They need
  an "on" side that extracts.
