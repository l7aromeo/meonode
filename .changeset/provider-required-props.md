---
'@meonode/ui': patch
---

Name the missing prop instead of dying inside a layout effect.

`ThemeProvider` called without `modes` threw
`Cannot read properties of undefined (reading 'includes')` from a minified
helper during React's commit phase — and only for some readers. Adoption reads
storage and the attribute, and with neither present the expression
short-circuited before it touched `modes`, so a first-time visitor was fine while
anyone who had ever chosen a theme got a dead page.

`tokens`, `modes` and `defaultMode` are required props, so TypeScript catches a
missing one for a caller it sees. A sandbox, a JavaScript consumer, a CDN-cached
bundle and a stale copy of a sample are callers it does not. Those are now told
which prop is missing and what it is for, along with a `defaultMode` or
`defaultPreference` that names a mode `modes` does not declare.

The checks are not behind `setDebugMode` or a development build: a caller that
was never typechecked is most likely running a production bundle, so a check that
goes quiet there protects nobody. This matches what `themeScript` already does
with its own configuration.
