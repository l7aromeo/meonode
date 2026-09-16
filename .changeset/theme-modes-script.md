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

`THEME_SCRIPT_CSP_HASH` is exported alongside it, so a policy can name the
script without rendering anything first:

```ts
headers.set('Content-Security-Policy', `script-src 'self' '${THEME_SCRIPT_CSP_HASH}'`)
```

Taking it from the package rather than copying a digest out of rendered output
is what keeps a policy correct across upgrades: a hand-copied hash goes stale the
day the body changes, and the only symptom is a browser refusing to run the
script.

**Three things an application has to do, and the reasons they are not optional:**

- **Put the script as early in `<head>` as the framework allows.** A classic
  inline script that follows a `<link rel="stylesheet">` cannot execute until
  that sheet has loaded. Measured in the Next app router, first is not
  achievable: React hoists a `data-precedence` stylesheet above anything a
  layout renders. That costs latency rather than correctness — the sheet ahead
  of it is render-blocking too, so nothing is painted before the script runs —
  but a slow or third-party stylesheet ahead of it delays the mode for no
  reason.
- **Define a usable palette at `:root`, with `[data-theme="…"]` blocks as
  overrides.** Every failure path — blocked storage, a sandboxed frame, a missing
  `matchMedia` — ends with no `data-theme` written. Palettes that exist only
  under the attribute leave those readers with an unstyled page, which is a worse
  outcome than the wrong mode.

The pre-paint claim is asserted as far as it can be: a probe placed immediately
after the script in `<head>` reports the attribute already set, which bounds the
write to before the body is parsed. That is a one-sided bound and not a
comparison against first paint, which the Paint Timing API did not make
available.
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
