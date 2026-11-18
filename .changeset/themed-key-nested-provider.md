---
'@meonode/ui': patch
---

A `css` key in a server component that uses a token only a nested `ThemeProvider` defines now resolves against that provider. Fixes #67.

An at-rule condition or a selector holding a `theme.*` token, such as `'@media (min-width: theme.breakpoint.md)'`, is resolved where the theme is. Before, when a host element above a nested provider was present, the key resolved against the outer provider instead: the rule was dropped and development reported the key as unresolved, although the token was defined where the element renders. It now resolves against the nearest provider, as it does in a client component, including for an element such as an `input` placed directly inside the `ThemeProvider`.

One case still resolves against the provider above, as before: an element that cannot hold a rule in its children, such as an `input`, `img` or a component, placed directly inside a component of your own or a third-party one that renders a provider, with no other element between. Such a component may inspect or clone the child it is given, so it keeps receiving exactly that child. Wrap the element in an element such as a `Div` to have its key resolve against the provider inside.
