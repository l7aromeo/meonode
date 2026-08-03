---
'@meonode/compiler': minor
---

Rewrite `theme.*` tokens inside `css` blocks at build time.

The token rewrite previously stopped at the top level of a props object, so
every token in a `css:` block was still converted on each render. It now
recurses into `css` object literals, choosing the plain or `--len` variable form
from the nearest enclosing property — with selectors and at-rules (`&:hover`,
`@media …`) contributing none, matching `@meonode/ui`'s own rule.

Keys are still never rewritten: `var()` is invalid inside media features and
selector text, so a token in a key must resolve against the live theme at
runtime. Arrays and tokens in non-selector keys are skipped for the same
reason — the property name they resolve to is not knowable at build time.

Beyond skipping the string replacement, a `css` block whose keys hold no tokens
now scans clean in `ThemeUtil.resolveObjWithTheme`, so its whole copy-on-write
walk collapses to returning the input unchanged.
