---
'@meonode/ui': patch
---

Stop crashing on unrecognised children in React Server Components.

The `react-server` build of React, which a server component loads, exports no
`Component`. Child processing checked `instanceof React.Component` to recognise
class component instances, and in a server component that check threw
`TypeError: Right-hand side of 'instanceof' is not an object` for any child it
reached, including a `Promise`, which is a legal child there. Such children are
now handed to React as written. Class component instances keep rendering on the
client and during server rendering, where `Component` exists.
