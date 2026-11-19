---
'@meonode/ui': patch
---

A `ThemeProvider` whose `tokens` is empty counts as a provider. The theme functions below it run with its theme, where they were dropped with a report that no ThemeProvider was above the node. With no provider at all, they are still dropped and reported.

Fixes #99.
