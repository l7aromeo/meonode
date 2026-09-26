---
'@meonode/ui': patch
---

A render-prop function given as the only child of an HTML element renders its result.

`Div({ children: () => … })` passed the function to React unchanged, which
cannot render a function as a child: the browser rendered an empty element, and
a server component failed to prerender. The same function inside an array,
`children: [() => …]`, already rendered its result, and now both do. A component
still receives a function child unchanged, so it can call it itself.
