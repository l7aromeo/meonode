---
'@meonode/ui': minor
---

Let a `children` array contain arrays.

`Div({ children: [Span('a'), items.map(render)] })` used to throw `Objects are
not valid as a React child`, naming MeoNode's internal fields. The only way to
combine siblings you wrote out with a generated list was to spread them into one
array — and a spread is the one shape that costs those siblings React's
missing-key exemption, because React grants it only while the generated part
stays a nested array.

So the shape that read most clearly was the shape the library then reported on.
Nesting now works at any depth, and behaves as React does:

```ts
// the heading is exempt; the list is still key-checked
Div({ children: [Span('heading'), rows.map(r => Row({ key: r.id, ...r }))] })
```

A children array that contains itself is dropped at the self-reference with a
development warning rather than overflowing the stack, and a function child
inside a nested array is normalised like any other — it previously went missing
from the output with nothing said.

Flat arrays, which are nearly all of them, skip the new traversal entirely:
measured against the previous release, zero allocation difference on the flat,
single-child and props-only shapes.
