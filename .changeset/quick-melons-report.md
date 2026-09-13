---
'@meonode/ui': patch
---

Report an unkeyed list, the way React does.

An unkeyed list reconciles by position, so deleting or reordering a row hands
the next one the row before it — its state, its focus, whatever the user had
typed into it. React reports that; MeoNode did not, for any list, because
`render()` spreads children variadically:

```js
createElement(div, null, a, b)   // 0 reports
createElement(div, null, [a, b]) // 1 report, same children
```

Separate arguments are React's signal that a human wrote the siblings out, so
it marks them validated and never asks for keys. Every MeoNode list took that
form, so every list was silently exempt from the check — including the ones
that most needed it.

The spread is not going away: it is what keeps authored siblings quiet, which
is a promise the library makes deliberately. Only children the compiler has
marked as generated — a `.map()`, a spread, an IIFE, a helper call — are now
handed to React as one array, and React raises its own warning from there. No
message is reimplemented here.

That distinction has to come from the compiler, because it cannot be recovered
at runtime: arguments are evaluated before the callee runs, so `items.map(fn)`
has already collapsed into an ordinary array by the time `Div({ children })` is
entered, indistinguishable from one typed out by hand. Inferring list-ness from
the value would nag in exactly the places React stays quiet. `@meonode/compiler`
sets `__meo$list` on a generated call site; this release is the half that reads
it, on marker schemas 2 and 3.

A generated list takes the array form however few rows it holds. React reports
an unkeyed one-element array and stays quiet for a bare child, and a `.map()`
over one row is exactly the list that grows to three later, carrying the
positional-reconciliation bug with it.

Nothing about reconciliation changes. Spread and array reconcile identically —
both wrong unkeyed, both correct keyed — so this restores a diagnostic and
nothing else. Uncompiled code, and code compiled by a version that does not set
the marker, behaves exactly as before.
