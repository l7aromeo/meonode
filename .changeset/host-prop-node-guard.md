---
'@meonode/ui': patch
---

Catch a node passed as a DOM attribute on a plain HTML tag.

`Div({ title: Span('x') })` rendered `title="[object Object]"` and said nothing.
It now throws, naming the prop and the call site.

Host tags only. Passing a node in a prop to a *component* stays supported — the
receiver may put it into its own children, where it resolves correctly, and only
the receiver knows which was meant. A plain tag has no receiver, so the case is
decidable and always wrong.
