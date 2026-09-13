---
'@meonode/ui': minor
---

Add `For`, a list helper that keys rows from the data.

React matches unkeyed children by position, so deleting or reordering a list
hands each surviving row the previous row's fiber — its state, its focus,
whatever the user had typed into it. `children: items.map(...)` inherits that
in full, and nothing in the library can fix it after the fact: by the time
`Div({ children: ... })` is called, `.map()` has already run and its result is
an ordinary array, indistinguishable *at runtime* from one written out by
hand. The compiler can still tell them apart, because it sees the source —
that is what the list diagnostic in this release is built on. But knowing a
list was generated is not the same as knowing which row is which, so it can
report the problem and only the data can fix it.

`For` takes the data instead of the finished nodes, so the identity is still
there to use:

```js
Div({ children: For(todos, todo => TodoRow({ todo })) })
```

The callback receives `(item, index, key)`, matching `Array.map` rather than
inverting it — the key is the one `For` applied, there for a row that wants to
reuse it and ignorable otherwise.

Rows are identified by object reference, which survives their contents
changing — renaming a row keeps its state, where hashing the contents would
discard it on every keystroke. Primitives identify themselves by value, and
two genuinely identical items fall back to their position, which is no worse
than the unkeyed list they replace.

Reference identity cannot follow items that are rebuilt between renders, so
`For(items, renderItem, item => item.id)` takes an explicit accessor. In
development, a list whose items are *all* new on a second render is reported
once, with that suggestion — on the first render every object is new, which
says nothing, so the check waits for a repeat before concluding anything.

Unkeyed `children: items.map(...)` still *reconciles* exactly as it does in
React — by position, so a delete or a reorder hands a row the previous row's
state. What changed in this release is that you now hear about it: see the
list-diagnostic entry above. `For` is the ergonomic answer to that warning, and
unlike the warning it needs no compiler.
