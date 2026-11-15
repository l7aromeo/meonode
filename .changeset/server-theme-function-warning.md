---
'@meonode/ui': patch
---

The development warning for a theme function (`theme => …`) dropped in a server component no longer says that no `ThemeProvider` is above the element. A provider may well be above it; a server component cannot run the function. The warning now says so, and points to a `theme.*` token string or a client component. On the client, where the cause is a missing provider, the wording is unchanged. Fixes #52.
