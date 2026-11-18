---
'@meonode/ui': patch
---

In development, two `ThemeProvider`s mounted at once that give a token different values now warn, whether or not one is inside the other. Refs #68.

Both declare the token on `:root`, so whichever declaration comes later in the document applies to the whole page, and the other provider's value is lost. Give one of the tokens a name of its own. Providers that give a token one value, or where one replaces the other, as on a route change, do not warn. A provider inside a hidden `<Activity>` is checked once it is shown.
