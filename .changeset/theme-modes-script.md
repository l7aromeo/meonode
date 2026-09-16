---
'@meonode/ui': minor
---

Apply the theme before the first paint, from a script the server can cache.

A document that names the reader's mode in its markup cannot be shared: either
every reader gets their own render, or somebody gets the wrong one and watches it
correct itself. `themeScript(config)` removes the reason to do either. It returns
a plain inline `<script>` node for `<head>` that reads the stored preference and
stamps the resolved mode on the document element, in the window after that
element exists and before the first paint. Palettes live in CSS keyed by
`[data-theme="…"]`, so the server sends one document to everybody and there is no
flicker, because there was never a wrong first paint to correct.

```ts
const theme = {
  modes: ['morning', 'night'],
  defaultMode: 'morning',
  system: { light: 'morning', dark: 'night' }, // optional
} as const

Html({
  suppressHydrationWarning: true,
  children: [
    Head({ children: [themeScript(theme), Link({ rel: 'stylesheet', href: '/app.css' })] }),
    Body({ children: ThemeModesProvider({ ...theme, tokens, children }) }),
  ],
})
```

The field names are the provider's, so one object feeds both and the two cannot
drift.

**The configuration travels in an attribute; the body is a constant.** The
element is `<script data-meonode-theme='{…}'>` with a fixed body that reads that
attribute back and parses it. Nothing an application names is ever interpolated
into JavaScript, so a mode called `a</script>…` has no context to escape from —
the injection class is absent rather than defended against. It also means the
body is the same bytes for every application and every configuration, so under a
hash-only CSP its `script-src 'sha256-…'` is one value that never changes, rather
than one per application that moves whenever somebody renames a mode.

**Three things an application has to do, and the reasons they are not optional:**

- **Put the script first in `<head>`, ahead of every stylesheet.** A classic
  inline script that follows a `<link rel="stylesheet">` cannot execute until
  that sheet has loaded, which is the delay the script exists to avoid.
- **Define a usable palette at `:root`, with `[data-theme="…"]` blocks as
  overrides.** Every failure path — blocked storage, a sandboxed frame, a missing
  `matchMedia` — ends with no `data-theme` written. Palettes that exist only
  under the attribute leave those readers with an unstyled page, which is a worse
  outcome than the wrong mode.
- **Set `suppressHydrationWarning` on the element the script writes to.** The
  attribute is not in the server markup, which is the definition of a mismatch.

**Failures are contained where containing them helps.** `localStorage` throws on
property access, not merely from `getItem`, where site data is blocked and in a
sandboxed iframe without `allow-same-origin`; that read is guarded on its own so
those readers still get the default rather than nothing. `matchMedia` is guarded
separately too, falling back to the light name, which is what the provider falls
back to as well. A stored `system` with no mapping resolves to the default
instead of stamping the word `system`, which no palette matches.

**A configuration that cannot work throws.** An empty `modes`, a `defaultMode` or
a `system` value that is not one of them, a mode named `system`, or a name
outside `[A-Za-z0-9_-]{1,64}`. Not gated on development: the configuration is
authored rather than data, so a check that fired only in development would let CI
pass and production ship a script that stamps a mode no selector matches. The
name restriction is for the application's sake — a mode name is the one value
that crosses from this configuration into `[data-theme="…"]` selectors written by
hand.
