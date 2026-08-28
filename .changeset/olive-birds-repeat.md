---
'@meonode/ui': patch
---

Scope server-rendered styles to the request that produced them.

The Emotion cache a server render collects into was reached through
`getGlobalState`, a plain module-level object, so one cache served every
request in the process and `cache.inserted` accumulated every style ever
rendered. `StyleRegistry` flushes that cache into the response, and its
per-request dedupe set cannot tell "this request's styles" from "some
earlier request's", so each page shipped the union of every route the
process had touched.

Measured on the documentation site: `/docs/hooks` needs 32 KB of CSS and was
serving 166 KB — 5.2x — with 189 of its 237 declared classes belonging to
other pages. It grows towards the union of the whole site as more routes are
hit, and it lands on a document that is `no-store` because of the CSP nonce,
so nothing can cache it away.

`StyleRegistry` now opens a scope per render and the compiler writes into
that. Same page, same server: **166 KB -> 32 KB**, and stable across repeat
requests instead of growing.

A scope adopts any rules compiled before it opened. `StyleRegistry` is a
client component, so it renders in the SSR pass, after the server components
above it have already compiled their `css` — scoping without that step
stranded their rules, putting the class in the markup while its declaration
never reached the document. The existing coverage for a themed `Link` on a
server page caught it.

Three tests were added around the concurrency case, since the scope is held
in a module-level binding: a route must emit the same styles whether it
renders alone or alongside others, two routes rendering together must not
absorb each other's, and one route fetched twice with traffic in between
must not grow.

Client rendering is untouched; `bun run bench` is unchanged.
