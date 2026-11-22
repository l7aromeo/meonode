---
'@meonode/ui': patch
---

`StyleRegistry` (`@meonode/ui/nextjs-registry`) now writes each server flush's styles in the order they were inserted, as Emotion does, instead of sorted by class name (#153). When two elements' rules set one property at equal specificity, insertion order decides which wins. Sorted, a server-rendered page settled such a tie by the two class hashes, so its first paint and the page after hydration could differ from the same page reached by client navigation. In `Div({ css: { '& > *': { color: 'green' } }, children: Span('child', { css: { color: 'blue' } }) })`, the child's colour under `StyleRegistry` depended on which class name sorted later; it is now the colour a client navigation gives. The output stays deterministic, since render order is.
