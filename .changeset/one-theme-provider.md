---
'@meonode/ui': major
---

One `ThemeProvider`, taking modes rather than a theme object.

```ts
ThemeProvider({
  modes: ['light', 'dark'],
  defaultMode: 'light',
  defaultPreference: 'system', // optional
  system: { light: 'light', dark: 'dark' }, // optional
  tokens,
  children,
})
```

`ThemeModesProvider` is removed — its behaviour is what `ThemeProvider` now does.
The `theme: Theme` shape is removed with it: a single-theme application declares
one mode, and one concept is easier to hold than two that overlap.

**Migrating from 2.x.** `ThemeProvider({ theme, children })` becomes
`ThemeProvider({ tokens: theme.system, modes: [theme.mode], defaultMode: theme.mode, children })`
for an application that has one palette, or a real mode list for one that has
several. Token values should be `var(--…)` references whose palettes live in CSS
keyed by `[data-theme="…"]`; that is what makes a server-rendered document the
same for every reader.

**`setTheme` is removed.** `setTheme(darkTheme)` becomes `setMode('dark')`.
`setTheme(previous => …)` has no direct equivalent, because there is no theme
object to derive a new one from — the mode is a name and the palette behind it is
CSS. Anything that computed a theme from the previous one is now either a
different mode name or a change to the token map itself.

This also removes a trap rather than documenting it: under the mode-aware
provider, `setTheme` could only honour the mode a theme object named and
discarded its palette silently, so a caller got a theme claiming one mode while
emitting another's variables.

`useTheme()` returns `theme`, `mode`, `preference`, `modes`, `setMode`,
`setPreference` and `hydrated`. `hydrated` is false until the provider has
adopted the reader's real mode: the first client render must match the server's,
so anything rendering markup from `mode` — a toggle position, a different icon —
should gate on it. Page-level theming does not need to: CSS keyed off
`[data-theme="…"]` is correct from the first painted frame.
