---
'@meonode/ui': patch
---

In development, a nested `ThemeProvider` that gives a token another value than a provider above it now warns. Refs #68.

Every `ThemeProvider` declares its tokens as CSS variables on `:root`, not on its own subtree. So a nested provider's value for a token the outer provider also defines applies to the whole page, outside the nested provider too, and two sibling providers share whichever value comes later in the document. Until providers scope their tokens, give a nested provider's tokens names of their own. A nested provider that adds new tokens, or repeats an outer value unchanged, does not warn.
