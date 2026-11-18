---
'@meonode/ui': patch
---

Resolve the theme tokens in what a `css` theme function returns, on the server as on the client.

- A function returning a whole style under a selector or at-rule key, as in `css: { '&:hover': () => ({ padding: 'theme.spacing.md' }) }`, wrote `padding:theme.spacing.md` into the stylesheet, which the browser drops, because a function under a key was resolved only when it returned a string. What it returns is now resolved like the rest of the style, including a function inside it and an array it returns.
- In a server component, where a theme function is called with the theme of a node's `theme` prop, a token in what it returned became the theme's raw value: `padding: () => 'theme.spacing.md'` with a numeric `spacing.md` gave `padding: 16`, which the browser drops, where a client component gave `16px`. It now becomes the same variable reference as on the client, so both compile the same class.

Fixes #80.
