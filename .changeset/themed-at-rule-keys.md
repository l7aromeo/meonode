---
'@meonode/ui': patch
---

Theme tokens in at-rule conditions and selectors resolve again in server components (#39).

A host tag rendered from a server component, whose `css` put a theme token in a
key such as `'@media (width >= theme.breakpoint.wide)'`, got a rule with the token
still in its condition. The browser drops such a rule, so every style behind a
themed breakpoint stopped applying. A condition or selector needs the theme's
concrete value, and a server component cannot read a `ThemeProvider` above it, so
such a host tag now renders through the client, which resolves the key from the
theme, as it did before 3.1.0. Every other host tag keeps rendering as a
server-compiled class.

A function component given such `css` from a server component has nothing to
resolve the key with either, and never had: that part of its rule is now left out
instead of shipping with the token, and in development a warning names the key. Render the
node from a client component to have the key resolved.
