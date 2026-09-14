---
'@meonode/ui': minor
'@meonode/compiler': minor
---

Say where an unkeyed list came from.

React cannot answer that in a MeoNode app. `Div({...})` only builds a node;
`createElement` fires later inside `.render()`, so React attributes every element
in the tree to that one call — every missing key anywhere in a file reports at
the same line, and the owner stack collapses to the same component for the same
reason.

The compiler already computed the call site and discarded it. With the new
`callSiteLocations` option it emits the source position, and the runtime names it
beside React's own report rather than in place of it:

```
[MeoNode] A generated list at src/app/page.ts:124:6 has children without a `key`.
```

It prints only when a child actually lacks a key, so a correctly keyed list stays
silent. It also prints in the one case React says nothing at all: a marked list
whose children reach a host element through an unmarked wrapper, where the
variadic hand-off tells React a human wrote the siblings out.

Opt in through the plugin options. The locations are absent from any build that
does not ask for them; with them on, the whole of a 55-file app grew by 759 bytes
gzipped.
