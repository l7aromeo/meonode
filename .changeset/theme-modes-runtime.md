---
'@meonode/ui': minor
---

Let a themed page be one document for every reader.

A themed SSR page could not be cached, because the provider rendered its
`:root{--meonode-theme-*}` block from whichever theme it held and the application
picked that theme per reader. Measured on a live site, light and dark differed in
all 62 theme variables and the documents were different sizes.

`ThemeProvider` gains a second shape where the markup stops depending on the
mode:

```ts
ThemeProvider({
  tokens,                                       // one map; values are var() refs
  modes: ['morning', 'night'],
  system: { light: 'morning', dark: 'night' },  // optional
  defaultMode: 'morning',
  children,
})
```

Token values are `var()` references, the palettes live in CSS keyed by
`[data-theme="…"]`, and a blocking script sets that attribute before the first
paint. The server then renders one document for everyone, with no flicker,
because there was never a wrong first paint to correct.

It takes one token map plus mode names rather than a theme per mode so the
cacheable property holds by construction: with a single map the emitted block is
the same whatever the reader stored, so the bytes cannot vary. A record of themes
would let an application put the per-reader variation straight back.

`useTheme()` gains `mode`, `preference`, `setMode` and `setPreference` beside
what it already returned. `preference` is what the reader chose — possibly
`'system'` — and `mode` is what that resolves to; storing the resolved value
instead would make following the OS impossible, since the first toggle would pin
it. `'system'` is offered only when the `system` mapping is given, because
`prefers-color-scheme` answers in the OS's words and an application whose modes
are `'morning'` and `'night'` has not said which is which until it says so.

Two behaviours change on the new path only. `useTheme` no longer writes the
document: every consumer runs it, so a write there was a write per reader of the
theme, which is how a provider on its default could overwrite a choice just made.
And the mode is no longer compared against `'dark'` — the attribute is set to the
mode name whatever it is, so a mode called `'sepia'` is no longer treated as
light. `ThemeProvider({ theme })` keeps its existing behaviour exactly, including
the class swapping, and is unaffected.

Rejections are explicit rather than silent. A mode that is not in `modes`, and
`'system'` without the mapping, are both ignored with a development warning
instead of setting a `data-theme` no selector matches. Passing `theme` alongside
`tokens` takes the mode path and says so once. A stored value that is not one of
the declared modes is discarded for `defaultMode`, which is also what makes an
upgrade safe: the original path writes `localStorage.theme` as a *mode* and this
one stores a *preference* under the same default key, so a leftover value is
honoured when it is still a declared mode and dropped otherwise.

`ThemeMode` was `'light' | 'dark' | string`, which collapses to `string` and lost
even those two from autocomplete. It is now `'light' | 'dark' | (string & {})`,
which keeps them as hints without closing the set. `MeoTheme` augmentation of
`mode` still overrides it.
