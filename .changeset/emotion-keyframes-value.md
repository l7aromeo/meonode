---
'@meonode/ui': patch
---

A `keyframes()` result as a value in `css`, as in `css: { animationName: fade }`, no longer throws under a `ThemeProvider` (`Cannot read properties of undefined (reading 'name')`), nor makes the element re-render on every mode change. Without a provider, development no longer reports it as a dropped theme function. Its `toString` was taken for a theme function; it is now left to Emotion, as are the `name` and the other fields Emotion keeps on `css()` and `keyframes()` results.

Fixes #92.
