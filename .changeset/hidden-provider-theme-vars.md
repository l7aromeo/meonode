---
'@meonode/ui': patch
---

Apply only the tokens of `ThemeProvider`s that are shown. A provider inside a hidden `<Activity>` went on declaring its tokens, and in a Next.js app with `cacheComponents`, which keeps the previous route mounted in one, two routes whose providers give a token different values showed the other route's value after each client-side navigation. A hidden provider now switches its block of CSS variables off until it is shown again. The server's markup is unchanged.

Fixes #95.
