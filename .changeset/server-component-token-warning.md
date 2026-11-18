---
'@meonode/ui': patch
---

In development, a `theme.*` token no `ThemeProvider` defines now warns in a server component too. Fixes #60.

A server component compiles its css without the provider's theme, so `Div({ color: 'theme.primary.typo' })` there emitted a variable nothing declares, and the element was silently unstyled while the same token in a client component warned. The server now hands the token references to a check that runs where the providers are: the warning appears in the server log and in the browser, as it does for a client component. Production output is unchanged and carries nothing for it; `setDebugMode(true)` turns it on there, as it does the other diagnostics.

The check, in server and client components alike, now counts the tokens of every provider above an element, not only the nearest one. A token an outer provider defines renders under a nested provider, so it is no longer reported there. A token used with no `ThemeProvider` above it at all now warns that no provider is above it, where before nothing was reported.
