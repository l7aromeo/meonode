---
'@meonode/ui': minor
---

A known property in a `css` object now accepts a fallback list: a readonly array of its string values, which Emotion writes as one declaration per item, as in `css: { display: ['-webkit-box', 'flex'] }` or `css: { padding: ['1px', 'theme.spacing.md'] }`. This matches Emotion's own `CSSObject`. Numbers, nested arrays and theme functions are still rejected as items, as Emotion rejects them, and the single value of each property is typed as before.
