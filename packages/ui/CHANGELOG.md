# @meonode/ui

## 2.1.0

### Minor Changes

- [#16](https://github.com/l7aromeo/meonode/pull/16) [`4d42425`](https://github.com/l7aromeo/meonode/commit/4d4242580e8d205d6d2eaf5a91cdfd7ac50727e6) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Report an unkeyed list, the way React does.

  **Expect new warnings on code that compiles clean today.** Any keyless
  `items.map(fn)` list starts reporting React's own missing-key warning once it is
  built with a compiler that emits the marker, and run on a `@meonode/ui` that
  understands it — this release or later. That is the feature working — those
  lists reconcile by position, so a delete or a reorder already hands a row the
  previous row's state — but it is a behaviour change, not a silent fix.
  The warning itself is development-only. The decision behind it is not free
  in production, but it is close: one property read and one falsy test per
  compiled node, short-circuiting before anything else on a call site whose
  children were not generated. Adding a `key` to each row
  resolves it, and is the fix for the underlying bug too.

  `For`, added in this same release, is the ergonomic way to do that: it takes the
  data rather than the finished rows and keys each one from it, so no key has to be
  threaded through every row by hand. It is a plain runtime helper and needs no
  compiler — which matters here, because this warning only appears for builds that
  use `@meonode/compiler`, while the positional-reconciliation bug it reports is
  there either way. If you are not compiling, you will not see the warning and
  `For` still fixes the problem.

  **Both halves are required, and an old pairing is worse than no pairing.** A
  compiler that emits `__meo$list` running against an earlier `@meonode/ui`
  produces no warnings at all — it produces console noise instead. No earlier
  runtime strips the key, so it reaches the element, and React rejects
  `__meo$list` as an attribute name and says so once per render of every marked
  call site, on the same console channel the key warnings would have used.
  Rendering is unaffected and production is untouched, but the diagnostic is not
  merely absent, it is replaced by something louder and less useful.

  Test for the capability rather than a version, since it is the capability that
  decides: a runtime understands the key when its `COMPILER_SCHEMA_KEYS` entries
  for schemas 2 and 3 carry a `list` field. That stays true however the version
  numbers land. This is a compatibility requirement of the marker contract, not a
  bug in either half — upgrade both together.

  An unkeyed list reconciles by position, so deleting or reordering a row hands
  the next one the row before it — its state, its focus, whatever the user had
  typed into it. React reports that; MeoNode did not, for any list, because
  `render()` spreads children variadically:

  ```js
  createElement(div, null, a, b) // 0 reports
  createElement(div, null, [a, b]) // 1 report, same children
  ```

  Separate arguments are React's signal that a human wrote the siblings out, so
  it marks them validated and never asks for keys. Every MeoNode list took that
  form, so every list was silently exempt from the check — including the ones
  that most needed it.

  The spread is not going away: it is what keeps authored siblings quiet, which
  is a promise the library makes deliberately. Only children the compiler has
  marked as generated — a `.map()`, a spread, an IIFE, a helper call — are now
  handed to React as one array, and React raises its own warning from there. No
  message is reimplemented here.

  That distinction has to come from the compiler, because it cannot be recovered
  at runtime: arguments are evaluated before the callee runs, so `items.map(fn)`
  has already collapsed into an ordinary array by the time `Div({ children })` is
  entered, indistinguishable from one typed out by hand. Inferring list-ness from
  the value would nag in exactly the places React stays quiet. `@meonode/compiler`
  sets `__meo$list` on a generated call site; this release is the half that reads
  it, on marker schemas 2 and 3.

  A generated list is reported however few rows it holds — a `.map()` over one row
  is exactly the list that grows to three later, carrying the bug with it. The
  marker says the expression was generated; the value it produced still decides,
  so `children: row`, a variable holding a single node that the compiler cannot
  see inside, stays silent. React draws the line in the same place: an unkeyed
  one-element array is reported, a bare child is not.

  Nothing about reconciliation changes. Spread and array reconcile identically —
  both wrong unkeyed, both correct keyed — so this restores a diagnostic and
  nothing else. Uncompiled code, and code compiled by a version that does not set
  the marker, behaves exactly as before.

- [#16](https://github.com/l7aromeo/meonode/pull/16) [`d377a51`](https://github.com/l7aromeo/meonode/commit/d377a5134fb29ada3d1dc7809fb3d3d2e400afd2) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `For`, a list helper that keys rows from the data.

  React matches unkeyed children by position, so deleting or reordering a list
  hands each surviving row the previous row's fiber — its state, its focus,
  whatever the user had typed into it. `children: items.map(...)` inherits that
  in full, and nothing in the library can fix it after the fact: by the time
  `Div({ children: ... })` is called, `.map()` has already run and its result is
  an ordinary array, indistinguishable _at runtime_ from one written out by
  hand. The compiler can still tell them apart, because it sees the source —
  that is what the list diagnostic in this release is built on. But knowing a
  list was generated is not the same as knowing which row is which, so it can
  report the problem and only the data can fix it.

  `For` takes the data instead of the finished nodes, so the identity is still
  there to use:

  ```js
  Div({ children: For(todos, todo => TodoRow({ todo })) })
  ```

  The callback receives `(item, index, key)`, matching `Array.map` rather than
  inverting it — the key is the one `For` applied, there for a row that wants to
  reuse it and ignorable otherwise.

  Rows are identified by object reference, which survives their contents
  changing — renaming a row keeps its state, where hashing the contents would
  discard it on every keystroke. Primitives identify themselves by value, and
  two genuinely identical items fall back to their position, which is no worse
  than the unkeyed list they replace.

  Reference identity cannot follow items that are rebuilt between renders, so
  `For(items, renderItem, item => item.id)` takes an explicit accessor. In
  development, a list whose items are _all_ new on a second render is reported
  once, with that suggestion — on the first render every object is new, which
  says nothing, so the check waits for a repeat before concluding anything.

  Unkeyed `children: items.map(...)` still _reconciles_ exactly as it does in
  React — by position, so a delete or a reorder hands a row the previous row's
  state. What changed in this release is that you now hear about it: see the
  list-diagnostic entry above. `For` is the ergonomic answer to that warning, and
  unlike the warning it needs no compiler.

### Patch Changes

- [#16](https://github.com/l7aromeo/meonode/pull/16) [`5769190`](https://github.com/l7aromeo/meonode/commit/57691901ff7b960d705b8f86eafdff25a6cd8f90) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Rebuild a memoized subtree when the node behind it is a different node.

  Every node given `deps` renders as a `MeoMemo` element, so two structurally
  different subtrees in the same position presented React with the same
  component type. React kept the fiber where it would otherwise have
  remounted, and `useMemo` — seeing `deps` compare equal — returned the
  element built for the _previous_ node:

  ```js
  Div({ children: cond ? Div({ children: 'A' }, []) : Section({ children: 'B' }, []) })
  // after cond flips: still <div>A</div>
  ```

  A key did not rescue it either. Giving the slot one stable key, which is the
  natural thing to write, still rendered the stale branch; only _differing_
  keys worked, which is the opposite of how keys behave everywhere else.

  `node.element` now joins the dependency list. The element type is stable for
  a given call site, so an ordinary re-render still hits the memo, while a
  genuine swap invalidates it.

  This restores React's own rule rather than inventing one. Measured against
  plain React with `useMemo([])` in both directions: a swap between two
  different component types remounts and rebuilds, and a swap between two of
  the same type keeps the frozen value. `[]` continues to mean freeze, exactly
  as `useMemo([])` does.

  This is a separate mechanism from the list diagnostic in this release, and
  does not change it: unkeyed lists still reorder and delete exactly as they do
  in React, and still need a `key`.

## 2.0.2

### Patch Changes

- [#14](https://github.com/l7aromeo/meonode/pull/14) [`aeb8791`](https://github.com/l7aromeo/meonode/commit/aeb8791c4cc828577d165d08f8dc3d09e157ad79) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Scope server-rendered styles to the request that produced them.

  The Emotion cache a server render collects into was reached through
  `getGlobalState`, a plain module-level object, so one cache served every
  request in the process and `cache.inserted` accumulated every style ever
  rendered. `StyleRegistry` flushes that cache into the response, and its
  per-request dedupe set cannot tell "this request's styles" from "some
  earlier request's", so each page shipped the union of every route the
  process had touched.

  Measured on the documentation site: `/docs/hooks` needs 32 KB of CSS and was
  serving 166 KB — 5.2x — with 189 of its 237 declared classes belonging to
  other pages. It grows towards the union of the whole site as more routes are
  hit, and it lands on a document that is `no-store` because of the CSP nonce,
  so nothing can cache it away.

  `StyleRegistry` now opens a scope per render and the compiler writes into
  that. Same page, same server: **166 KB -> 32 KB**, and stable across repeat
  requests instead of growing.

  A scope adopts any rules compiled before it opened. `StyleRegistry` is a
  client component, so it renders in the SSR pass, after the server components
  above it have already compiled their `css` — scoping without that step
  stranded their rules, putting the class in the markup while its declaration
  never reached the document. The existing coverage for a themed `Link` on a
  server page caught it.

  Three tests were added around the concurrency case, since the scope is held
  in a module-level binding: a route must emit the same styles whether it
  renders alone or alongside others, two routes rendering together must not
  absorb each other's, and one route fetched twice with traffic in between
  must not grow.

  Client rendering is untouched; `bun run bench` is unchanged.

## 2.0.1

### Patch Changes

- [#12](https://github.com/l7aromeo/meonode/pull/12) [`09d74ba`](https://github.com/l7aromeo/meonode/commit/09d74bafc8bb27638d86b4ce2a1a32a7f4341a99) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Remove four internal members left behind when the element cache was replaced.

  `NodeUtil.hashString`, `NodeUtil.hashCSS`, `NodeUtil.isStyleProp` and
  `NodeUtil.shouldNodeUpdate` all existed to serve the derived-key element
  cache — hashing props into a lookup string, and deciding whether a node's
  dependency list allowed it to be skipped. Nothing computes a key or a
  signature any more, so all four lost their last caller and shipped inert.

  Confirmed dead before removing: each appears exactly once across `src`,
  `tests`, `scripts` and `bench` — its own definition — and zero times in
  `@meonode/mui`, `@meonode/compiler` or the documentation site. `NodeUtil`
  is not exported from any package entry (`.`, `./client`,
  `./nextjs-registry`), so none of them were reachable from outside the
  package and no consumer can be relying on them.

  No behaviour change. All suites pass unchanged: 270 unit, 271 compiled,
  76 RSC in each mode.

## 2.0.0

### Major Changes

- [#10](https://github.com/l7aromeo/meonode/pull/10) [`7482625`](https://github.com/l7aromeo/meonode/commit/74826251a0f5c28b9e9b54620da28141db77f470) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Replace the element cache with fiber-backed memoization.

  A node given `deps` had its rendered element held in one process-global `Map`,
  keyed by a string derived from the node's props and its position under the
  render root. Deriving identity that way carried two structural bugs:

  - **Collisions.** Two different subtrees that derived the same string shared one
    entry, and the second rendered the first's content. React composes what a
    component returns, so the positional chain restarted at every component
    boundary — which made two components with structurally identical trees, and
    two instances of one component, both collide. `@meonode/compiler` narrowed
    this with `__meo$k`, a source-position hash, but could not close it: two
    instances of the same component share a source position.
  - **No release.** Only a render root carried an unmount hook, so a memoized
    _child_ was never evicted when it unmounted. Twenty memoized rows, list
    emptied, whole tree unmounted, left twenty entries — cleared only by the next
    SPA navigation.

  A memoized subtree now renders inside a `MeoMemo` fiber holding
  `useMemo(() => node.render(), deps)`. Identity is the fiber, so there is nothing
  to derive and nothing to collide, for plain function components and `Component`
  alike. Release is React dropping the fiber. `deps` semantics are unchanged.

  Faster, not slower, because the derived key is what cost the most:

  |                                | before   | after            |
  | ------------------------------ | -------- | ---------------- |
  | node construction              | 31.89 ms | 13.24 ms (2.4x)  |
  | client render                  | 23.73 ms | 17.07 ms (1.39x) |
  | 200 memoized rows x 31 renders | 14.85 ms | 8.74 ms (1.70x)  |
  | entries left after unmount     | 200      | 0                |

  `deps` now means literally what React means by it. Previously the cache key
  folded in a signature of the node's props, so a prop change invalidated the
  entry regardless of the dependency list — `deps: []` did not really mean "never
  rebuild", it meant "rebuild whenever a prop changes". The list is now handed
  straight to `useMemo`, so `deps: []` freezes the subtree and a node that should
  follow a value has to declare it:

  ```js
  // 1.x rebuilt this when `id` changed. It no longer does.
  Div({ ...props, padding: '4px' }, [])

  // Declare what it follows.
  Div({ ...props, padding: '4px' }, [props.id])
  ```

  Server rendering is untouched: nothing was ever memoized there, and `MeoMemo` is
  client-only and rendered rather than called, so it never crosses an RSC
  boundary.

  **Breaking.** Everything the derived key needed is gone:

  - `BaseNode.elementCache`, `BaseNode.cacheCleanupRegistry`, `BaseNode.clearCaches`
    and `Node.clearCaches`
  - `NodeInstance.signature` and the deprecated `NodeInstance.stableKey`
  - `NodeUtil.createPropSignature`, `NodeUtil.hashDynamicValues`,
    `NodeUtil.extractCriticalProps`, `NodeUtil.shouldCacheElement`
  - `MountTrackerUtil` and `NavigationCacheManagerUtil`, including its
    `history.pushState` / `replaceState` patching
  - `render()`'s `parentBlocked` and `scope` parameters. `render(container, node)`
    from `@meonode/ui/client` no longer needs a per-container namespace and takes
    the same arguments as before.

  Most applications call none of these. Code that called `Node.clearCaches()`
  between tests or on navigation can simply drop the call.

  `@meonode/compiler` output stays compatible. `__meo$k` and `__meo$dyn` are
  accepted and stripped, just no longer read, so the plugin remains a pure
  build-time speedup — a smaller one, because uncompiled construction got much
  faster.

### Patch Changes

- [#9](https://github.com/l7aromeo/meonode/pull/9) [`20936ea`](https://github.com/l7aromeo/meonode/commit/20936ea22a397eed3e9d8db8bbfe44bbcd256382) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Publish the prerelease line from CI, and preflight releases properly.

  CI ran only on `main`, and the Release workflow only fired on a successful CI
  run for `main`, so the `beta` line had no sanctioned publish path at all —
  leaving a laptop as the only option. `@meonode/ui` and `@meonode/compiler` set
  `publishConfig.provenance`, which npm can only satisfy from a provider it
  recognises, so a local `changeset publish` shipped `@meonode/mui` (no
  provenance) and then failed on the other two. That left a released package
  whose peer dependency did not exist on the registry.

  Both workflows now trigger on `beta` as well, so the prerelease line publishes
  the same way `main` does, with attestations intact. The trigger has to be
  listed on the default branch to take effect at all — GitHub reads a
  `workflow_run` workflow from there, so editing it on `beta` alone changes
  nothing.

  Added `bun run release:dry`, run in the release job before anything is
  published. `npm publish --dry-run` alone would not have caught this: it packs
  the tarball and reports success without ever evaluating
  `publishConfig.provenance`. The preflight checks what actually decides the
  outcome — that every package asking for provenance is somewhere it can be
  minted (on GitHub Actions, that means `id-token: write`, not merely "in CI"),
  and that no version is already on the registry — then defers to
  `npm publish --dry-run` for packing, `files` and auth.

## 2.0.0-beta.0

### Major Changes

- [`7482625`](https://github.com/l7aromeo/meonode/commit/74826251a0f5c28b9e9b54620da28141db77f470) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Replace the element cache with fiber-backed memoization.

  A node given `deps` had its rendered element held in one process-global `Map`,
  keyed by a string derived from the node's props and its position under the
  render root. Deriving identity that way carried two structural bugs:

  - **Collisions.** Two different subtrees that derived the same string shared one
    entry, and the second rendered the first's content. React composes what a
    component returns, so the positional chain restarted at every component
    boundary — which made two components with structurally identical trees, and
    two instances of one component, both collide. `@meonode/compiler` narrowed
    this with `__meo$k`, a source-position hash, but could not close it: two
    instances of the same component share a source position.
  - **No release.** Only a render root carried an unmount hook, so a memoized
    _child_ was never evicted when it unmounted. Twenty memoized rows, list
    emptied, whole tree unmounted, left twenty entries — cleared only by the next
    SPA navigation.

  A memoized subtree now renders inside a `MeoMemo` fiber holding
  `useMemo(() => node.render(), deps)`. Identity is the fiber, so there is nothing
  to derive and nothing to collide, for plain function components and `Component`
  alike. Release is React dropping the fiber. `deps` semantics are unchanged.

  Faster, not slower, because the derived key is what cost the most:

  |                                | before   | after            |
  | ------------------------------ | -------- | ---------------- |
  | node construction              | 31.89 ms | 13.24 ms (2.4x)  |
  | client render                  | 23.73 ms | 17.07 ms (1.39x) |
  | 200 memoized rows x 31 renders | 14.85 ms | 8.74 ms (1.70x)  |
  | entries left after unmount     | 200      | 0                |

  `deps` now means literally what React means by it. Previously the cache key
  folded in a signature of the node's props, so a prop change invalidated the
  entry regardless of the dependency list — `deps: []` did not really mean "never
  rebuild", it meant "rebuild whenever a prop changes". The list is now handed
  straight to `useMemo`, so `deps: []` freezes the subtree and a node that should
  follow a value has to declare it:

  ```js
  // 1.x rebuilt this when `id` changed. It no longer does.
  Div({ ...props, padding: '4px' }, [])

  // Declare what it follows.
  Div({ ...props, padding: '4px' }, [props.id])
  ```

  Server rendering is untouched: nothing was ever memoized there, and `MeoMemo` is
  client-only and rendered rather than called, so it never crosses an RSC
  boundary.

  **Breaking.** Everything the derived key needed is gone:

  - `BaseNode.elementCache`, `BaseNode.cacheCleanupRegistry`, `BaseNode.clearCaches`
    and `Node.clearCaches`
  - `NodeInstance.signature` and the deprecated `NodeInstance.stableKey`
  - `NodeUtil.createPropSignature`, `NodeUtil.hashDynamicValues`,
    `NodeUtil.extractCriticalProps`, `NodeUtil.shouldCacheElement`
  - `MountTrackerUtil` and `NavigationCacheManagerUtil`, including its
    `history.pushState` / `replaceState` patching
  - `render()`'s `parentBlocked` and `scope` parameters. `render(container, node)`
    from `@meonode/ui/client` no longer needs a per-container namespace and takes
    the same arguments as before.

  Most applications call none of these. Code that called `Node.clearCaches()`
  between tests or on navigation can simply drop the call.

  `@meonode/compiler` output stays compatible. `__meo$k` and `__meo$dyn` are
  accepted and stripped, just no longer read, so the plugin remains a pure
  build-time speedup — a smaller one, because uncompiled construction got much
  faster.

## 1.8.7

### Patch Changes

- [#1](https://github.com/l7aromeo/meonode/pull/1) [`5d234ac`](https://github.com/l7aromeo/meonode/commit/5d234acb9d15dc77de33eff8624d5eb9a2622e37) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Point the package metadata at the new monorepo. `repository`, `bugs` and `homepage` referenced the three separate repositories that have now been merged into [l7aromeo/meonode](https://github.com/l7aromeo/meonode), and each package gains a `repository.directory` so npm links to its own subtree. No functional change — npm reads these fields from the published tarball, so a release is the only way to correct them.
