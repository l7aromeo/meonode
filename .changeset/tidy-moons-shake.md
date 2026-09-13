---
'@meonode/ui': patch
---

Rebuild a memoized subtree when the node behind it is a different node.

Every node given `deps` renders as a `MeoMemo` element, so two structurally
different subtrees in the same position presented React with the same
component type. React kept the fiber where it would otherwise have
remounted, and `useMemo` — seeing `deps` compare equal — returned the
element built for the *previous* node:

```js
Div({ children: cond ? Div({ children: 'A' }, []) : Section({ children: 'B' }, []) })
// after cond flips: still <div>A</div>
```

A key did not rescue it either. Giving the slot one stable key, which is the
natural thing to write, still rendered the stale branch; only *differing*
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
