---
'@meonode/ui': patch
---

Render a render-prop function given as the only child of an HTML element.

`Div({ children: () => … })` passed the function to React unchanged, which
cannot render a function as a child: the browser rendered an empty element, and
a server component failed to prerender with `Functions are not valid as a child
of Client Components`. The same function inside an array, `children: [() => …]`,
already rendered its result. A render-prop function that is an element's only
child now renders its result the same way. A component still receives a function
child unchanged, so it can call the function itself.
