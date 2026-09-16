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
  defaultPreference: 'system', // optional; defaults to defaultMode
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

Take it from the package rather than copying the digest out of rendered output.
A copied literal goes stale the first time this body changes, and that failure is
silent in every way a test usually looks. The policy is still valid, the element
is still in the document, and the page still settles in the right mode, because
the provider applies it after hydration. The one symptom is that `data-theme` is
absent *until* hydration — which is precisely the flash the script exists to
prevent, and nothing downstream of hydration can observe it.

Three assertions make that visible, and none of them costs anything in the
script:

- the served `script-src` contains `THEME_SCRIPT_CSP_HASH`. This catches a stale
  literal exactly, before a browser is involved.
- no `csp-violation` report arrives. Measured against a deliberately stale
  hash, a `ReportingObserver` for `csp-violation` with `buffered: true` reports
  it with `effectiveDirective: 'script-src-elem'` even when it is registered
  after the page has loaded, which a test usually is. A
  `securitypolicyviolation` listener has to be in place before the parser
  reaches the script, so it is the wrong shape for this.
- `data-theme` is present *before* hydration — read it at `load`, not after.
  After hydration the provider has written it and the check can no longer fail.

A policy whose hashes are derived from the rendered response, as a hashing proxy
does, is unaffected: it re-derives the digest per response and never holds a copy
to go stale.

**`defaultPreference` is where a reader starts; `defaultMode` is where everything
lands when it fails.** They are usually the same and do not have to be, and only
the first can be `'system'`. A first visit is the one case where the OS
preference is all that is known about what the reader wants, and `defaultMode`
cannot express following it: it has to name a mode, and a mode may not be called
`system`. So a site that wants to begin by asking the OS says
`defaultPreference: 'system'`, and still names a `defaultMode` for when nothing
can answer — a blocked storage, a missing `matchMedia`, a stored mode that has
since been renamed. Omitted, it is `defaultMode`, so nothing existing moves.

**A site that declares its modes gets them checked.** `modes`, `defaultMode`,
`defaultPreference` and both sides of `system` are typed as `ResolvedThemeMode`,
which is `MeoTheme['mode']` when a site augments it and the loose `ThemeMode`
when it does not — so an un-augmented site sees no change at all, and an
augmented one gets autocomplete for its own names and a compile error on a
misspelt one. That case is otherwise invisible: a typo in `modes` is consistent
with itself, so `defaultMode` is still a member of `modes`, every runtime check
passes, and the only symptom is a stylesheet that matches nothing.

```ts
declare module '@meonode/ui' {
  interface MeoTheme {
    mode: 'morning' | 'night'
  }
}
```

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
a `system` value that is not one of them, a `defaultPreference` that is neither a
mode nor `'system'`, a `defaultPreference: 'system'` with no mapping to say what
the OS's words mean here, a mode named `system`, or a name outside
`[A-Za-z0-9_-]{1,64}`. Not gated on development: the configuration is
authored rather than data, so a check that fired only in development would let CI
pass and production ship a script that stamps a mode no selector matches. The
name restriction is for the application's sake — a mode name is the one value
that crosses from this configuration into `[data-theme="…"]` selectors written by
hand.
