---
'@meonode/ui': minor
---

Experimental: the runtime side of `@meonode/compiler`'s `experimental_extractCss` option. A call site the compiler named at build time renders with the class and rule it would have had uncompiled. The runtime skips that node's style work at render: no theme resolution, serialization or hashing. A node built from a template joins its values into the registered text and names the result, hashing once per distinct set of values. Compiled modules register their styles with `registerStaticCss` and `registerStaticTemplate`, and write template values with `toCssValue`. All three are exported from every entry.

- **Same output.** Each named style goes through Emotion's own cache under Emotion's name, at the point in render order where Emotion would insert it. Class names, rule order, server HTML and hydration are the same with extraction on and off. The cache's stylis plugins apply as before, and `StyleRegistry`, a scoped server render without a cache provider and React Server Components all work unchanged.
- **Same element types.** A named node the compiler marks as a carrier renders through MeoNode's styled renderer, and every other named node renders a plain element. The compiler places carriers so that a node's element type is the same on every render, so a named node never remounts, or loses its state, where the same node uncompiled would not. If a compiled node arrives without the carrier it needs, the runtime renders it as one, so the output stays the same; such a node may remount when its position changes.
- **Boundaries keep their order.** A named style is never inserted ahead of a component, a memoized node, `Suspense`, `SuspenseList` or `Activity` on behalf of a node inside it. Each of these may render its children later or elsewhere.

Output without the compiler's markers renders exactly as before.
