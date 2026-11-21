# @meonode/ui

[![NPM version](https://img.shields.io/npm/v/@meonode/ui.svg?style=flat)](https://www.npmjs.com/package/@meonode/ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@meonode/ui)](https://bundlephobia.com/package/@meonode/ui)

**Type-safe React components without JSX**

A production-ready component library that replaces JSX with function-based composition, featuring direct CSS prop
styling, context-based theming, opt-in node-level memoization, and full React Server Components support—powered by
@emotion/react.

## Core Concept

MeoNode UI eliminates JSX while maintaining full React compatibility through functional composition. Style components
with CSS properties as props, leverage automatic theme resolution via React Context, and benefit from intelligent
caching without manual optimization.

**JSX Pattern:**

```tsx
<div style={{ padding: '20px', borderRadius: '12px' }}>
  <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{title}</h2>
  {children}
</div>
```

**MeoNode Pattern:**

```typescript
Div({
  padding: '20px',
  borderRadius: '12px',
  backgroundColor: 'theme.primary',
  children: [H2(title, { fontSize: '1.5rem', marginBottom: '8px' }), ...children],
})
```

## Features

### Function-Based Composition

Plain JavaScript functions replace JSX—no build transforms, no syntax extensions. Compose UIs as first-class function
trees with full TypeScript inference.

Nothing here requires a build step. An optional build-time plugin,
[`@meonode/compiler`](https://ui.meonode.com/docs/getting-started/compiler), moves part of the per-render prop work to
build time.

### Nested Array Children

A `children` array can hold arrays, and the nesting carries meaning: a nested array is a list, its siblings are not.

```typescript
Div({
  children: [
    H2('Members'), // an authored sibling
    members.map(member => Row({ key: member.id, children: member.name })), // a list — React checks these for keys
  ],
})
```

React skips the missing-key check on children it receives as separate arguments and runs it on the members of an array
it receives as one. Nesting keeps those two apart: the heading is exempt, the rows are checked, and a row without a
`key` is reported. Spreading the rows instead — `...members.map(...)` — makes each one look like an authored sibling,
so the check never runs and the missing key goes unreported while the rows still remount on every render. Spreading was
the only option before, because a nested array used to reach React unrendered and throw
`Objects are not valid as a React child`.

Nesting is unlimited. The same array placed twice renders twice, as in React; only an array that contains itself is
dropped, rather than left to overflow the stack.

A child renders as React renders it: `Span(0)` gives `<span>0</span>`, and `''` reaches a component as `''`. Only `null`,
`undefined` and `false` render nothing. So `children: count && Badge(count)` renders `0` when `count` is 0, exactly as
`{count && <Badge />}` does in JSX; write `count > 0 && Badge(count)` to render nothing.

### Built Elements as Children

A node takes elements made elsewhere as children: `createElement` output, JSX from another file, or a node's `.render()`
result. Their props are final, so the node passes them on as they are rather than sorting them into styles and
attributes again.

- **Keys and attributes stay as written.** A `theme.*` token is turned into a CSS variable only where it is a style
  value: in a plain tag's inline `style`, and in a component element's props, which may take style values under any name
  (MUI's `sx`, an icon's `color`). A `title` or a key that happens to contain `theme.` is left alone.
- **Children keep their shape.** A list stays a list, a list of one included, so React checks its keys and reports a
  missing one exactly as when it renders the element itself.

### Keyed Lists with `For()`

React matches children by position unless they carry a `key`, so deleting or reordering an unkeyed list hands each
surviving row the previous row's fiber — its state, its focus, its half-typed input. `children: items.map(...)`
inherits that rule in full, and position is the one thing that cannot tell you which row is which after a reorder.

The data can. `For()` takes the data rather than the finished nodes and keys each row from it.

```typescript
Div({ children: For(todos, todo => TodoRow({ todo })) })
```

A row is identified by its object reference, which survives the row's contents changing: renaming a row keeps its
state, where hashing the contents would throw it away on every keystroke. Pass an identity accessor whenever the items
are rebuilt between renders — a fresh fetch, a `.map()` that spreads — since references cannot see through that.

```typescript
Div({ children: For(todos, todo => TodoRow({ todo }), todo => todo.id) })
```

Development says so when it detects that case, rather than letting the list remount silently.

### Direct CSS-in-Props

Pass CSS properties directly to components. No separate styled-components declarations, no className juggling. All valid
CSS properties work as props with full type safety.

```typescript
Button('Submit', {
  padding: '12px 24px',
  backgroundColor: 'theme.primary',
  borderRadius: 8,
  transition: 'all 0.2s ease',
  css: {
    ':hover': { transform: 'scale(1.05)' },
  },
})
```

### Advanced Portal System

Manage complex UI layers like modals, drawers, and overlays with a powerful stack-based portal system. Supports nested portals and state synchronization.

**Key Features:**
- **Global Layout Integration:** Define the provider and host at the root for app-wide access.
- **Auto-Sync:** Keep portal content in sync with parent state automatically.
- **Nested Portals:** Open portals from within other portals easily.
- **Stack-based management:** Automatically manages multiple overlapping layers.

```typescript
// 1. Setup at Layout Level
const RootLayout = ({ children }: { children: ReactNode }) => 
  PortalProvider({
    children: [
      ...children,
      PortalHost() // Portals render here, on top of content
    ]
  })

// 2. Define data interface and portal content
interface MyData {
  count: number;
  setCount: React.Dispatch<React.SetStateAction<number>>;
}

const MyPortalContent = ({ data, close }: PortalLayerProps<MyData>) => 
  Div({
    children: [
      Text(`Count: ${data?.count}`),
      Button('Increment', { onClick: () => data?.setCount(c => c + 1) }),
      Button('Close', { onClick: close })
    ]
  })

// 3. Use anywhere in the tree
const MyComponent = () => {
  const [count, setCount] = useState(0)
  // Auto-sync: portal updates whenever count changes
  const portal = usePortal<MyData>({ count, setCount })

  return Div({
    children: [
      Button('Open Modal', { 
        onClick: () => portal.open(MyPortalContent) 
      })
    ]
  })
}
```



### Context-Based Theming

Theme values resolve automatically through React Context. Reference semantic tokens anywhere without prop drilling.

```typescript
ThemeProvider({
  modes: ['light', 'dark'],
  defaultMode: 'light',
  tokens: {
    primary: { default: '#FF6B6B', content: '#4A0000' },
    spacing: { sm: 8, md: 16, lg: 24 },
  },
  children: [
    /* your app */
  ],
})
```

Every token becomes a CSS variable, so `Div({ color: 'theme.primary' })` renders `color: var(--meonode-theme-primary)`
in client and server components alike. A nested `ThemeProvider` can add tokens of its own for its subtree, but its
variables are declared on `:root` like the outer provider's: a nested provider that gives a token the outer provider
already defines another value changes it for the whole page, so in development it warns. So do two providers mounted
side by side that give one token different values. Give nested tokens names of their own.

### Theme Modes Without a Flash

A server-rendered page cannot know which mode a reader is in. A cookie makes the response depend on who asked for it,
so no cache can share it; a guess is a flash of the wrong theme for everyone it got wrong.

`ThemeProvider` avoids both. Colours are `var()` references, so one token object serves every mode and the server sends
the same bytes to every reader. Which palette applies is decided by `data-theme` on `<html>`, written by `themeScript`
**before the first paint**: there is no flash because there was never a wrong first paint to correct.

```typescript
import { Body, Head, Html, themeScript, ThemeProvider, type ThemeScriptConfig } from '@meonode/ui'

// Mode names are yours -- `light` and `dark` are not required.
const themeConfig = {
  modes: ['morning', 'night'],
  defaultMode: 'morning',       // where everything falls back to when nothing else answers
  defaultPreference: 'system',  // where a reader who has chosen nothing starts
  system: { light: 'morning', dark: 'night' },
} satisfies ThemeScriptConfig

// Place the script first in <head>, ahead of any stylesheet.
Html({
  lang: 'en',
  suppressHydrationWarning: true,
  children: [
    Head({ key: 'theme', children: themeScript(themeConfig) }),
    Body({ key: 'body', children: ThemeProvider({ ...themeConfig, tokens, children }) }),
  ],
})
```

Spreading one literal into both halves is the point: a mode added in one place reaches the script and the provider
together. Augment `MeoTheme` with `mode: 'morning' | 'night'` and `setMode` autocompletes your names and rejects a
typo.

If your Content-Security-Policy pins hashes, import `THEME_SCRIPT_CSP_HASH` rather than copying the value — a copied
literal goes stale the first time the body changes, and it fails silently.

> Do not render markup from `mode`. The server cannot know it, so a component that branches on it disagrees with the
> server during hydration for every reader not on the default, and React answers that by re-rendering the whole page
> on the client — which clears the attributes the script wrote. Key the CSS off `[data-theme='…']`, or gate on
> `hydrated` from `useTheme()`.

### Surgical Memoization

Memoize at node-level granularity—not just entire components. A node given a dependency array renders inside a React
fiber of its own, and the array is handed straight to `useMemo`: it means exactly what it means in React, so an empty
array freezes the subtree and a node that should follow a value has to name it. Nodes without one are not memoized and
rebuild with their parent.

**Node-Level Memoization:**

```typescript
const UserCard = ({ user }) =>
  Div(
    {
      padding: 16,
      children: [
        H2(user.name),
        Text(user.bio),
      ],
    },
    [user.id],
  ).render() // The whole subtree rebuilds only when user.id changes
```

**Component-Level Memoization:**

```typescript
Node(ExpensiveComponent, { data }, [data.id]).render()
```

### React Server Components Compatible

Full RSC support with proper client/server component boundaries. Use in Next.js App Router, Remix, or any RSC-enabled
environment without configuration.

The package ships a separate build for the server components layer, selected through the `react-server` export
condition, so the code only server components run stays out of the browser bundle. Import it by its package name and let
the bundler resolve it. An alias that points `@meonode/ui` at a file in its `dist/` folder loads the browser's build in
that layer, and `@meonode/ui` throws an error saying so. Don't list it in Next.js `serverExternalPackages` either: its
client components only work when the bundler handles the package.

### Emotion-Powered Styling

Built on @emotion/react for:

- Automatic critical CSS extraction
- Vendor prefixing
- Dead code elimination
- Server-side rendering support

### Smart Prop Differentiation

Automatically separates style props from DOM attributes. Pass `onClick`, `aria-*`, `data-*` alongside CSS props—MeoNode
routes them correctly.

```typescript
Button('Click Me', {
  padding: '12px', // → style
  color: 'theme.primary', // → style
  onClick: handleClick, // → DOM attribute
  'aria-label': 'Submit', // → DOM attribute
  disabled: isLoading, // → DOM attribute
})
```

### Debug Mode

There are two levels of diagnostics, and only the second needs a flag.

**On in development, nothing to turn on.** Each of these is your own code, and each is actionable:

- a `theme.*` token the active theme does not define — the common cause of a style that silently fails to apply, since
  the browser drops a declaration referencing a variable no `:root` rule declares
- the two other shapes that emit invalid CSS: a number written as a string (`padding: '12'`, which Emotion will not add
  `px` to) and a unitless length in a media query
- a generated list whose children have no `key`. React reports the missing key itself; this names the call site it came
  from, which React's own message cannot (needs `@meonode/compiler` with `callSiteLocations`)
- an error thrown inside a function-as-a-child, which is otherwise swallowed and leaves the element missing with
  nothing printed
- `For()` given a list where every item is a fresh object, so reference identity cannot match renders and every row
  remounts
- a `children` array that contains itself

React's own warnings and React DevTools name the component that called `.render()` as the owner of every element in
the tree it returns, including an element built in another component and passed in as a child: a node rebuilds that
element where it renders. So when `App` builds an element and `Panel` passes it to a node, a missing-key warning for a
list inside it ends "It was passed a child from Panel." Look in the component that built the element too.

**Behind `setDebugMode`, in any environment.** These are MeoNode's own introspection recovering from itself — the
render is correct afterwards and there is nothing for you to fix, so they are off unless you go looking:

- `@meonode/compiler` marker buckets colliding with reserved keys
- the `node.prototype.render` probe failing
- the key-name derivation falling back

```typescript
import { setDebugMode } from '@meonode/ui'

setDebugMode(true)
```

Set it at module scope in your entry file, not in a `useEffect` — theme diagnostics fire as nodes are constructed and
an effect runs too late to catch the first render's worth.

In a production build the flag also turns the first group back on. That group is quiet there because `NODE_ENV` says
`production` — read at runtime on Node, or substituted by a bundler, which folds that half of the gate to `false`; a
browser bundle in which nothing substitutes it counts as production too. The
messages themselves ship either way: the flag is a runtime binding, not a build-time constant, so bundlers cannot strip
the text, and a minified bundle built with `process.env.NODE_ENV` substituted still contains every one of them. That is
deliberate — the bugs worth this much logging are usually the ones that only reproduce in production.

The cost is the diagnostics' code in every browser bundle: about 4 KB gzipped in 3.3.0 (the theme checks about 2.5 KB,
the generated-list report about 1.5 KB), whether or not the flag is ever set.

📖 [Full list of what it logs](https://ui.meonode.com/docs/getting-started/faq)

## Performance Benchmarks

> **How these were measured.** In Google Chrome 158, in a window, through Playwright: `bench/browser-comparison.mjs`
> with `BENCH_BROWSER=chrome`, against **production** React 19 and @emotion/react 11.14, on an Apple M4 Pro. A
> measurement is the whole step a page pays: building the tree (`Node` calls and `.render()`), then React's render and
> commit. Each figure is the median over 10 fresh pages; the sides run in a shuffled order every round, garbage is
> collected before every sample, and every page started at a 1-minute load average under 10. Two clocks: **JavaScript
> only** stops after the commit; **to the frame** also includes the browser's style, layout and paint of the frame that
> shows it (not raster or GPU presentation). The script is in the repository; its `bench/README.md` describes every case.

### Cost over plain React

Time each side adds over React setting a static `className`, in µs per node (or per level, row or update), on the
same tree:

| Case                                  | Emotion `css` prop | MeoNode, styled | MeoNode, `className` only |
|:--------------------------------------|-------------------:|----------------:|--------------------------:|
| Mount, 10k flat nodes                 | 1.16 · 1.02        | 2.87 · 2.62     | 0.91 · 0.99               |
| Mount, 500 nested levels              | 1.06 · 1.52        | 2.36 · 2.97     | 0.78 · 1.34               |
| Update, 1k rows whose colour flips    | 0.96 · 0.90        | 2.20 · 2.63     | 0.80 · 0.82               |
| Update, a controlled input            | 1.10               | 3.05            | 1.20                      |

Each cell is **JavaScript only · to the frame**. "Styled" gives every node one style prop, which MeoNode resolves and
hands to Emotion, so it includes Emotion's own cost (the first column). "`className` only" is MeoNode with no
CSS-in-JS: about what building the node and passing its props costs. The input's time to the frame is not published:
at one input per update its resolution is about ±20 µs.

### A whole app, first load and after

An app-shaped tree of about 10k nodes, 31 levels deep with a component every 3 levels, a `ThemeProvider` at the root
and one inside, theme tokens, and css that differs on every node; its update changes the css of 30% of the nodes. And
10k styled spans under a `ThemeProvider`. **Cold** is the first mount on a fresh page, with Emotion's sheet empty and
the code not yet run, and for the app the update right after it; **warm** is a later mount or update on the same page.
In ms, JavaScript only, this release against the one before:

| Case                         | Before | This release | Change              |
|:-----------------------------|-------:|-------------:|:--------------------|
| App, cold mount              | 117.3  | 111.5        | −5.6 ± 1.1 (−4.8%)  |
| App, cold update             | 67.4   | 61.4         | −5.8 ± 1.0 (−8.7%)  |
| App, warm mount              | 51.6   | 43.0         | −8.7 ± 0.7 (−16.8%) |
| App, warm update             | 46.5   | 39.2         | −7.4 ± 0.3 (−15.9%) |
| 10k under a provider, cold   | 71.2   | 67.1         | −3.7 ± 0.9 (−5.2%)  |
| 10k under a provider, warm   | 48.2   | 41.2         | −7.3 ± 0.6 (−15.0%) |

To the frame, the app's cold mount takes 163.7 ms (−5.5 ± 1.0) and its warm mount 79.6 ms (−8.8 ± 0.9).

**±** is the resolution: the half-width of a 90% bootstrap interval of the per-page differences, plus the largest
difference two copies of one build showed between runs (up to about 0.17 µs per node on some cases; its cause is not
known). A change inside its ± is not a measured change, and at 90% about one figure in twenty that did not change will
still land outside it, so a lone small change near its ± needs a second run before it is quoted.

### Fibers and depth

A styled node takes **3 fibers** on the mount that first inserts its rule and **2** after; Emotion's `css` prop takes 3
and React with a `className` 1.

`.render()` itself walks the tree with an explicit stack, but React's commit recurses through every fiber, so a deep
tree is bounded by the browser's stack. In Chrome 158, on the first mount of a fresh page, a chain of styled nodes
mounts **1,287** levels deep; under a `ThemeProvider` with different css on every level, **1,355**; with a component at
every level, **875**.

### Memory Management

Heap growth measured in jsdom after a forced collection (`bench/memory.mjs`, Node 26, the same in each of three runs),
against the ceiling each check asserts:

| Check                              | Growth      | Ceiling  |
|:-----------------------------------|:------------|:---------|
| 50 heavy state updates             | **1.8 MB**  | 150 MB   |
| 200 mounts/unmounts over 20 cycles | 14.1 MB     | 20 MB    |
| 10 navigation cycles               | **1.0 MB**  | 20 MB    |

`bench/memory.mjs` exits non-zero if any ceiling is exceeded, so it works as a leak gate you run deliberately.

## Quick Start

```typescript
import { ThemeProvider, Center, Column, H1, Button, Text } from '@meonode/ui'

const tokens = {
  primary: { default: '#FF6B6B', content: '#FFFFFF' },
  base: { default: '#F8F8F8', content: '#333333' },
}

const App = () =>
  ThemeProvider({
    modes: ['light'],
    defaultMode: 'light',
    tokens,
    children: [
      Center({
        padding: 40,
        backgroundColor: 'theme.base',
        children: Column({
          gap: 24,
          children: [
            H1('MeoNode UI', {
              fontSize: '3rem',
              color: 'theme.primary',
            }),
            Text('Type-safe React without JSX', {
              fontSize: '1.2rem',
              color: 'theme.base.content',
            }),
            Button('Get Started', {
              backgroundColor: 'theme.primary',
              color: 'theme.primary.content',
              padding: '12px 24px',
              borderRadius: 8,
              cursor: 'pointer',
              onClick: () => console.log('Started!'),
            }),
          ],
        }),
      }),
    ],
  }).render()
```

## Architecture

**Component Factory System**
`Node` factory + `Component` wrapper + semantic elements (Div, Button, etc.) enable both rapid prototyping and
sophisticated component architectures.

**Theme Resolution Engine**
Context-based theme propagation with automatic value resolution. Tokens become CSS variables, so server components use
them as client components do, and development reports a token no `ThemeProvider` above defines.

**CSS Engine**
@emotion/react serializes each style object and inserts the resulting rule at runtime, once per distinct style, and
extracts critical CSS for SSR. MeoNode names each class from a SHA-256 of the style's whole text, so two different
styles do not share a class. Class names are not a stable API: they may change between versions.

## Why MeoNode UI?

**For Teams Building Design Systems:**

- Context-based theme propagation
- Semantic token system ensures visual consistency
- Component composition patterns scale naturally
- Full TypeScript support catches design token errors

**For Server Rendering and Scale:**

- Emotion inserts each distinct style once and reuses its class
- Surgical memoization at node granularity
- SSR-ready with critical CSS extraction
- RSC compatibility for modern React architectures

**For Developer Productivity:**

- No JSX transform in the build
- Direct CSS-in-props reduces context switching
- Intelligent prop routing (style vs DOM attributes)
- Full autocomplete for all CSS properties
- Composable function trees with first-class JavaScript

## Documentation

📚 **[Complete Documentation & Examples](https://ui.meonode.com)**

🧪 **Example apps:** [Next.js](https://github.com/l7aromeo/meonode-nextjs) · [Vite](https://github.com/l7aromeo/meonode-vite)

## Contributing

We welcome contributions! Please see
our [contributing guidelines](https://github.com/l7aromeo/meonode/blob/main/CONTRIBUTING.md).

## License

MIT © [Ukasyah Rahmatullah Zada](https://github.com/l7aromeo)

---

**[📖 Full Documentation](https://ui.meonode.com)** • **[🐛 Issues](https://github.com/l7aromeo/meonode/issues)** • *
*[💬 Discussions](https://github.com/l7aromeo/meonode/discussions)**
