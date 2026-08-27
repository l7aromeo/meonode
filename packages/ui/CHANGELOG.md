# @meonode/ui

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
