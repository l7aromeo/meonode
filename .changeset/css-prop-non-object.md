---
'@meonode/ui': patch
---

Render a `css` prop that is not a plain object.

The runtime combined `css` with a node's flat CSS props by spreading it into one
object, which is only correct for a map of rules. Every other shape the type
accepts came out wrong, whether used alone or next to flat props:

- An array, nested or not, became rules keyed by index — `.css-x 0{…}`,
  `.css-x 1:hover{…}` — descendant selectors that never match.
- A string became one declaration per character (`0:m;1:a;2:r;…`).
- A function, such as `theme => ({ … })`, vanished.
- An Emotion `css()` result kept only its own rules: Emotion serialises an object
  with a `styles` string from that string alone, so the flat props beside it and
  the runtime's `min-width`/`min-height`/`flex-shrink` defaults were dropped.

A `css` that is not a map is now handed to Emotion as `[flatCssProps, css]`, so
`css` still wins a conflict. The runtime's defaults go in front of it as their
own layer, so a declaration the author wrote always follows and wins, even
inside a string. A function inside such an array is called with the meonode
theme, like one under an object key. A `css` that is a map — the common case —
takes the same path as before and renders byte-identically.

Type narrowing: the top-level `css` prop no longer accepts a `number` or a
`ComponentSelector`. Neither ever rendered anything meaningful as a whole style;
both remain valid inside one. `boolean`, `null` and `undefined` are still
accepted, so `css: active && { … }` works as before.
