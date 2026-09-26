---
'@meonode/ui': patch
---

The `css` prop: a call site extends a factory's `css`, every shape the type accepts renders, and theme values resolve the same on server and client.

- **A call-site `css` extends a factory's instead of replacing it (#31).**
  `createNode` and `createChildrenFirstNode` combined props with a shallow
  spread, so a call site that added one rule dropped every pseudo-class, media
  query and `@supports` fallback the factory defined. Two maps now merge key by
  key, recursing into nested selectors and at-rules, with the call site winning a
  conflict; an explicit `undefined` still drops one factory rule. When either
  side is an Emotion `css()` result, an array, a function or a string, the two are
  composed as `[factoryCss, callSiteCss]`, so both apply and the call site wins.
  `css: false` or `null` at the call site still replaces the factory's.

  ```ts
  const Card = createNode('div', { padding: 24, css: { '&:hover': { color: 'blue' } } })

  Card({ css: { margin: 4 } }) // keeps :hover
  ```

- **Non-object `css` renders.** It was spread into one object with the flat CSS
  props, which is only right for a map: an array became rules keyed by index
  (`.css-x 0{…}`, never matching), a string one declaration per character, a
  function vanished, and a `css()` result dropped the flat props and runtime
  defaults beside it. It is now composed after the flat props, so `css` still
  wins. A `css` map renders exactly as before.
- **Type:** the top-level `css` prop no longer accepts a `number` or a
  `ComponentSelector`, which never produced a style as the whole value; both are
  still valid inside one. `boolean`, `null` and `undefined` are still accepted, so
  `css: active && { … }` works.
- **`theme.*` strings inside arrays** (`fontFamily: ['Arial', 'theme.font.body']`,
  a string `css`, a string inside an array `css`) now resolve to their CSS
  variable on the client as they already did on the server, so both produce the
  same class.
- **Theme functions with no `ThemeProvider` are dropped** wherever they sit,
  instead of reaching Emotion, which printed their source into the stylesheet and
  the server HTML (`color:(t) =>t.system.primary;`). In development a warning
  names the property, once.
