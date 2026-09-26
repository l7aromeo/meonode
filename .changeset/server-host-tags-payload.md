---
'@meonode/ui': patch
---

Stop serialising the `css` of host tags rendered by a server component.

In a React Server Component, a host tag with styles — `Div`, `Span`, `Button`, …
— was rendered as a client component with its whole `css` object as a prop, so
the styles reached the browser twice: once as the emitted rule and once in the
flight payload, to be resolved again during hydration. These tags are now
compiled on the server into a class name and render as the element itself.
`:hover`, media queries and theme tokens behave as before, and tokens still
resolve to `var(--meonode-theme-*)`. A 200-row page's flight payload drops from
55.1 KB to 24.5 KB.

Host tags inside `'use client'` components and all rendering outside the RSC
layer are unchanged.
