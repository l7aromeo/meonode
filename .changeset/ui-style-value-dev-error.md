---
'@meonode/ui': patch
---

Development builds now report a value no style can be under a prop MeoNode takes as a style (#161). Every prop named like a CSS property is a style, for host nodes and for components alike, so a component's own prop that shares such a name (a portal's `container`, a `content` or `color` prop) never reaches the component. When that value is a DOM node, a React element, a node, a class instance or an object that contains itself, styling it either recursed until the stack overflowed or wrote an empty rule, and nothing named the prop. A `console.error` now names the prop, the node and the fix: pass the value in `props: { … }`. Values under `css` are checked the same way. Each distinct message is logged once, up to 500 distinct messages at a time. The call behaves as before, and production builds make no check.
