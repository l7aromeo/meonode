---
'@meonode/compiler': patch
'@meonode/mui': patch
---

Point `homepage` and the README at the documentation site.

Both packages sent readers to their GitHub folder instead of the docs.
`@meonode/ui` already links to `ui.meonode.com`, so these were the two
outliers, and npm package pages are among the strongest signals pointing
at the docs domain — which Google currently reports as 0 indexed pages,
19 not indexed, with the whole site sitting in "Crawled - currently not
indexed" three months after the domain move.

`homepage` now deep-links to each package's own page —
`/docs/mui-integration` and `/docs/getting-started/compiler` — and both
READMEs carry a Documentation link near the top, where npm renders it.
