---
'@meonode/ui': patch
---

Theme tokens in Emotion's `css()` and `keyframes()` results now keep their unit. Their `styles` are CSS text, but were converted as the value of a property named `styles`, so a numeric token under a length property, as in `css: css({ padding: 'theme.spacing.md' })`, became a bare number the browser drops. They are now read as CSS text on the server and in the browser, so each token takes its declaration's unit, as in any other CSS text.

Fixes #88.
