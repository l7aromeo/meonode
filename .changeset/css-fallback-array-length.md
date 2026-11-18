---
'@meonode/ui': patch
---

Give a numeric theme token its unit inside a fallback array. `css: { padding: ['theme.spacing.md'] }` wrote `padding: var(--meonode-theme-spacing-md)`, which holds a bare number such as `16`, so the browser dropped the declaration and the padding was 0. The single value, `css: { padding: 'theme.spacing.md' }`, already referenced the length variant and got `16px`.

Each item of a length property's fallback array now takes the length variant, as the property's single value does. Fallback arrays of properties where a bare number is valid, such as `lineHeight`, keep the plain variable, and a theme function in a fallback array is still called once. Server and client convert the same way, so their classes still match.

Fixes #75.
