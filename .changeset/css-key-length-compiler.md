---
'@meonode/compiler': patch
---

Rewrite a numeric theme token under a kebab-case or vendor-prefixed key to the length variant, as `@meonode/ui` now does. `css: { 'padding-top': 'theme.spacing.md' }` compiled to the plain variable while the camel-case `paddingTop` got the length variant; both forms, and `'-webkit-margin-start'` and `'-ms-wrap-margin'`, now compile alike and match what the runtime renders for the same call.

The README's note on arrays now says what the runtime does: it converts string items in arrays on the server and the client alike, so leaving them to the runtime renders the same output.

Fixes #74, fixes #76.
