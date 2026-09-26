---
'@meonode/ui': patch
---

Server-rendered components use the same Emotion class prefix as the client when
no `StyleRegistry` is present.

With no `StyleRegistry` — a plain `renderToString` and `hydrateRoot` app, for
example — a function component styled with `css` was compiled on the server
under the `meonode-css` key, while
the client rendered it through Emotion's default cache, keyed `css`. The two
classes differed only in their prefix (`meonode-css-1w1jvzs` against
`css-1w1jvzs`), and React reported that the server-rendered attributes did not
match and would not be patched. The server now uses Emotion's default key there,
so both sides emit the same class. Inside `StyleRegistry`, and for React Server
Components, class names are unchanged.

Known limitation: an Emotion-styled component, such as one from MUI, rendered
as a server function component outside Next with no registry still hydrates with
different classes. The server hands it the compiled class as a plain
`className`, so the element carries two classes. On the client the class is
registered in Emotion's cache, and the component merges it into one. Render
such trees inside `StyleRegistry`, or inside an Emotion `CacheProvider` with an
SSR style extractor, so both sides share one cache.
