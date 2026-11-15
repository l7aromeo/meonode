---
'@meonode/ui': patch
---

Development warnings now appear under `vite dev` (#54). MeoNode decided it was in
development only when a `process` global existed, and Vite gives the browser
none, so every warning — an undefined theme token, a number written as a
string, a unitless media query, a dropped theme function — stayed silent in
Vite apps.

`NODE_ENV` is now read as the `process.env.NODE_ENV` that bundlers substitute,
so it is on under `vite dev` and `next dev`, in Node and in Vitest, and off in
production builds, where the check still folds to a constant. A browser bundle
in which nothing substitutes it counts as production.
