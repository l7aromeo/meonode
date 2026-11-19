---
'@meonode/ui': patch
---

An Emotion styled component or component selector passed as `css`, through a cast or from plain JavaScript, no longer crashes the render with `Maximum call stack size exceeded` or `Cannot convert object to primitive value`. Development throws an error that names it and where it sits, such as `` `css["&:hover"]` is an Emotion styled component or component selector ``; production leaves it out and renders the rest of the style, as Emotion does with a component selector it cannot use.

In a server component, a styled component imported from a `'use client'` module arrives as a client reference. Development now names that too, such as `` `css["&:hover"]` is a client component or a client module export ``, where it used to report a theme function dropped; production leaves it out, as before.

Fixes #87.
