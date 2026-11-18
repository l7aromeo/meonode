---
'@meonode/ui': patch
---

Give a numeric theme token its unit inside a `css` string. `css: 'padding: theme.spacing.md;'` wrote `padding: var(--meonode-theme-spacing-md)`, which holds a bare number such as `16`, so the browser dropped the declaration and the padding was 0. The object form, `css: { padding: 'theme.spacing.md' }`, already referenced the length variant and got `16px`.

A token in CSS text (a `css` string, or a string in a `css` array) now takes the length variant whenever its declaration's property takes a length, as in the object form. This covers hyphenated and vendor-prefixed names, shorthands, `!important`, `calc()`, and declarations inside nested blocks. Properties where a bare number is valid, such as `line-height`, `z-index` and `opacity`, keep the plain variable. Server and client convert the same way, so their classes still match.

Fixes #72.
