---
'@meonode/ui': patch
---

A `deps` argument that is not an array is now reported in development with `console.error`, naming the factory and the arguments it takes (#149). The usual cause is props passed one place too far: `Li('x', { key: 'a' })` on a factory that takes `(props, deps)` put `{ key: 'a' }` in `deps`, where it was not applied, and the node then failed in the browser with `t is not iterable` and no hint of which call was wrong. The message names `Node`, a `Component(Name)` callable, or the element a factory was made for, with its signature. Each distinct message is logged once, so a component that makes the call on every render reports it once. Nothing else changes: the call behaves as before, and production builds make no check.
