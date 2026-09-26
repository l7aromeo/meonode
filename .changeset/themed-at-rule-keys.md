---
'@meonode/ui': patch
---

Theme tokens in at-rule conditions and selectors resolve again in server components (#39).

A node rendered from a server component, whose `css` put a theme token in a key
such as `'@media (width >= theme.breakpoint.wide)'`, got a rule with the token
still in its condition. The browser drops such a rule, so every style behind a
themed breakpoint stopped applying. A condition or selector needs the theme's
concrete value, not a CSS variable, and a server component cannot read the
`ThemeProvider` above it. That part of the node's `css` is now written where the
theme is, in the client tree, for the class the server gave the element, so the
element stays the one element it was and the rest of its `css` is still compiled
on the server. This covers host tags and function components alike, conditions
nested inside selectors, `css` written as a string, where a token in a block's
condition or selector is resolved the same way, and a class carrying such a key
that is handed to another styled element, including across a `'use cache'`
boundary. A selector naming a class or id that merely contains `theme.`, such as
`'& .theme.accent'`, is left as written.

A key with a theme token now keeps its place in the `css` object when it is
resolved. It used to move after the entries written below it. Visible change: a
themed at-rule or selector that conflicts with a block written after it now
loses to that block, as the written order says it should; before, it won.

A key whose token cannot be resolved, because no `ThemeProvider` is above the node
or its theme has no such value, is left out rather than written with the token, in
server and client components alike, and in development a warning names the key.
