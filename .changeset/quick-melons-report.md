---
'@meonode/ui': minor
---

Report an unkeyed list, the way React does.

**Expect new warnings on code that compiles clean today.** Any keyless
`items.map(fn)` list starts reporting React's own missing-key warning once it is
built with a compiler that emits the marker, and run on a `@meonode/ui` that
understands it — this release or later. That is the feature working — those
lists reconcile by position, so a delete or a reorder already hands a row the
previous row's state — but it is a behaviour change, not a silent fix.
Development-only, and no runtime cost in production. Adding a `key` to each row
resolves it, and is the fix for the underlying bug too.

`For`, added in this same release, is the ergonomic way to do that: it takes the
data rather than the finished rows and keys each one from it, so no key has to be
threaded through every row by hand. It is a plain runtime helper and needs no
compiler — which matters here, because this warning only appears for builds that
use `@meonode/compiler`, while the positional-reconciliation bug it reports is
there either way. If you are not compiling, you will not see the warning and
`For` still fixes the problem.

**Both halves are required, and an old pairing is worse than no pairing.** A
compiler that emits `__meo$list` running against an earlier `@meonode/ui`
produces no warnings at all — it produces console noise instead. No earlier
runtime strips the key, so it reaches the element, and React rejects
`__meo$list` as an attribute name and says so once per render of every marked
call site, on the same console channel the key warnings would have used.
Rendering is unaffected and production is untouched, but the diagnostic is not
merely absent, it is replaced by something louder and less useful.

Test for the capability rather than a version, since it is the capability that
decides: a runtime understands the key when its `COMPILER_SCHEMA_KEYS` entries
for schemas 2 and 3 carry a `list` field. That stays true however the version
numbers land. This is a compatibility requirement of the marker contract, not a
bug in either half — upgrade both together.

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

A generated list is reported however few rows it holds — a `.map()` over one row
is exactly the list that grows to three later, carrying the bug with it. The
marker says the expression was generated; the value it produced still decides,
so `children: row`, a variable holding a single node that the compiler cannot
see inside, stays silent. React draws the line in the same place: an unkeyed
one-element array is reported, a bare child is not.

Nothing about reconciliation changes. Spread and array reconcile identically —
both wrong unkeyed, both correct keyed — so this restores a diagnostic and
nothing else. Uncompiled code, and code compiled by a version that does not set
the marker, behaves exactly as before.
