---
'@meonode/ui': patch
---

A call-site `css` now extends a factory's `css` instead of replacing it.

`createNode` and `createChildrenFirstNode` combined a factory's props with a call
site's using a shallow spread. Flat CSS props are separate keys, so they already
combined one by one, but `css` is a single key holding a whole map of rules — so a
call site that added one rule dropped every pseudo-class, media query,
`@supports` block and keyframe the factory had defined.

```ts
const Card = createNode('div', {
  padding: 24,
  css: {
    '&:hover': { color: 'blue' },
    '@supports not (backdrop-filter: blur(1px))': { background: 'white' },
  },
})

Card({ css: { margin: 4 } }) // now keeps :hover and @supports
```

The two maps merge key by key, recursing into nested selectors and at-rules, with
the call site winning a conflict — the semantics top-level CSS props already had.
An explicit `undefined` wins too, so a call site can still drop a single factory
rule: `Card({ css: { '&:hover': undefined } })`.

Only two plain rule maps are merged. If either side is something else — an Emotion
`css()` result, an array, a function — the call site's value is used as-is,
exactly as before. The factory's own `css` object is never written to, so one call
site's rules cannot leak into another's render.
