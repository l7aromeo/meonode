---
'@meonode/ui': patch
---

Give a numeric theme token its unit under a kebab-case or vendor-prefixed `css` key. `css: { 'padding-top': 'theme.spacing.md' }` wrote `padding-top: var(--meonode-theme-spacing-md)`, which holds a bare number such as `16`, so the browser dropped the declaration and the padding was 0, where `paddingTop` got `16px`. A key now names its property in any form Emotion writes as that property, so `'padding-top'`, `'-webkit-margin-start'` and `'-ms-wrap-margin'` take the length variant as their camel-case forms do. Custom properties such as `'--gap'` and unitless properties such as `'line-height'` keep the plain variable.

Fixes #74.
