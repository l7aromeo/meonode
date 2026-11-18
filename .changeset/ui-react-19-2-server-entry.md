---
'@meonode/ui': patch
---

Load in React Server Components on React 19.2, the lowest version `@meonode/ui` supports.

No 19.2.x release exports `Activity` from its `react-server` build, and `@meonode/ui` imported it by name. So wherever server components ran on the project's own React 19.2.x, the whole package failed to load, whether or not the project used `Activity`: through the ES module entry with `SyntaxError: Named export 'Activity' not found`, and through the CommonJS entry with `Invalid element type: undefined provided!`. Next.js was not affected, because it renders server components with its own copy of React.

`Activity` now works in server components on React 19.2 as well: a server component's `Activity` reaches the browser as React's own, so `mode: 'hidden'` hides its content and keeps its state.
