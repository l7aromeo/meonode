---
'@meonode/ui': minor
---

Let a themed page be one document for every reader.

A themed SSR page could not be cached, because the provider rendered its
`:root{--meonode-theme-*}` block from whichever theme it held and the application
picked that theme per reader. Measured on a live site, light and dark differed in
all 62 theme variables and the documents were different sizes.

A second provider, `ThemeModesProvider`, renders markup that does not depend on
the mode:

```ts
ThemeModesProvider({
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
what it already returned. Only `mode` is meaningful under `ThemeProvider`, where
it reads the current theme's own mode; `preference` is absent there and the two
setters throw, naming `ThemeModesProvider`. Changing a mode while keeping the
theme's `system` would not be a mode switch on that path — the palettes are
different objects with different values, so it would emit one mode's variables
under the other's name. `preference` is what the reader chose — possibly
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

**`ThemeModesProvider` is the path to build on.** `ThemeProvider` keeps the
shorter name only because taking it would break every existing application, not
because it is the better default — a themed page it renders still varies per
reader. The intended direction is that a future major makes `ThemeProvider` mean
this behaviour and the theme-swapping shape takes a legacy name or goes.

Two components rather than two shapes on one, because `createNode` infers a
component's props and a union of the two collapses to `never` there, which stops
every existing call site compiling. Keeping them separate also means a
half-configured provider — `tokens` without `modes` — is a compile error rather
than a throw at render. For the same reason there is no runtime rule about
passing both: the situation cannot be expressed, since neither component accepts
the other's props. `ThemeProvider` itself is untouched.

The provider renders `defaultMode` on its first pass — server and client alike —
and adopts the reader's real mode in a layout effect, exposing `hydrated` on the
context so a consumer can gate on the handover. Reading the attribute or storage
while rendering makes the two first renders differ for every reader whose mode is
not the default, which React requires to be identical. Alone that is invisible;
combined with a consumer that renders anything from `mode` — a toggle's position,
a different icon, a component present in only one mode — React throws #418,
discards the server tree and client-renders the document. The readers who trigger
it are exactly those who chose a non-default mode, which is rarely whoever is
testing, so `hydrated` exists to let such a consumer wait for the handover
deliberately.

The page itself does not flash: page-level theming is CSS keyed off the attribute
the pre-paint script already wrote. Only React markup that depends on the mode
takes a second pass.

`defaultPreference` says what a reader who has never chosen starts on, which the
mode cannot express: `defaultMode: 'night'` means "dark when nothing is stored",
while `defaultPreference: 'system'` means "follow the OS until told otherwise".
It defaults to `defaultMode`, a stored choice outranks it, and `'system'` without
a `system` mapping throws at construction — unlike a *stored* `'system'` with no
mapping, which is a reader's leftover and degrades quietly. The field is also
what lets one configuration literal feed both the pre-paint script and the
provider, which is not possible while only one half declares it.

A site that declares its mode names through `MeoTheme` gets them everywhere. The
provider's props, the mapping in `system`, and everything `useTheme()` hands back
— `mode`, `modes`, `setMode`, `setPreference` — take `ResolvedThemeMode`, which
is `MeoTheme['mode']` when augmented and the loose `ThemeMode` when not, so an
un-augmented site is unaffected. Augmented, `setMode('nigth')` stops compiling;
before, every string was accepted and autocomplete offered `'light'` and `'dark'`
to a site that uses neither. A misspelt mode is consistent with itself, so no
runtime check can catch it — `defaultMode` is a member of `modes`, every
validation passes, and no stylesheet matches.

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
