---
'@meonode/ui': patch
---

Show `ThemeProvider` with `tokens` in the README's Quick Start and in its own documentation comment. Both still passed it a `theme` object, which it has not taken since 2.3.0, so the Quick Start copied as written threw "ThemeProvider: `tokens` is missing". It now passes `tokens`, `modes` and `defaultMode`, as the theming guide does.
