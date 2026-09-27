---
'@meonode/ui': patch
---

A slow page no longer loses the server HTML of its Suspense boundaries when `ThemeProvider` hydrates (#46).

The provider adopted the reader's stored mode by setting state as it hydrated,
which changed its context value. React discards the server HTML of any Suspense
boundary below a changed context that has not hydrated yet, and renders it again
in the browser: on a slow load, content the reader was already looking at, or
scrolled to through a `#fragment` link, was replaced, losing its scroll position
and state, and content the server was still streaming was thrown away. The mode
now lives outside the context: each `useTheme` reader takes the reader's mode as
it hydrates, before paint, and nothing else re-renders. On a page rendered only in
the browser, a reader has the reader's mode from its first render.

`PortalProvider` had the same problem when a layer was opened while the page was
still hydrating, from a mount effect for instance: opening one now re-renders
`PortalHost` alone.
