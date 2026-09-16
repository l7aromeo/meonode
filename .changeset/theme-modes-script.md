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
  children: [Head({ children: themeScript(theme) }), Body({ children: ThemeProvider({ ...theme, tokens, children }) })],
})
```

The field names are the provider's, so one object feeds both and the two cannot
drift. `suppressHydrationWarning` belongs on the element the script writes to:
the served markup and the hydrating DOM differ there by design.

The emitted source is a pure function of the config, byte for byte, which is what
lets a hash-only CSP work — `script-src 'sha256-…'` is computed ahead of the
request, and a byte of drift makes the browser refuse to run the script, leaving
the page in the wrong mode with nothing able to correct it.

`system` is emitted only when the mapping is given: `prefers-color-scheme`
answers in the OS's two words, and an application whose modes are `morning` and
`night` has not said which is which until it says so. A stored value that is not
a declared mode is discarded rather than stamped, since the provider discards it
too. The whole body is wrapped in `try`/`catch` — storage throws in private mode
and where site data is blocked, and a blocking script in `<head>` is the one
place an uncaught error can stop the document.
