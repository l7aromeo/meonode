---
'@meonode/ui': patch
---

Resolve the theme tokens in a style a theme function returns. `css: { '&:hover': () => ({ padding: 'theme.spacing.md' }) }` wrote `padding:theme.spacing.md` into the stylesheet, which the browser drops, because a function under a key was resolved only when it returned a string. What it returns is now resolved like the rest of the style, under a selector or an at-rule key, including a function inside it and an array it returns.

Fixes #80.
