---
'@meonode/ui': patch
---

Debug mode in a production build reports unkeyed lists as development does.

- A compiled list whose children lack a `key` is now noted in production whether or not `callSiteLocations` recorded its location, and the note says it is the only report, since React's production build makes none. It no longer says that React reports the missing key ([#187](https://github.com/l7aromeo/meonode/issues/187)). Development output is unchanged.
- An uncompiled list that grows from the first update after a transition render, as a click after Next.js hydration does, is reported at that update, as in development, instead of one growth later ([#186](https://github.com/l7aromeo/meonode/issues/186)). The call site now ends where React calls the component, which MeoNode learns from the first render of a styled node or a `ThemeProvider`, minified React included. A page with neither, a class component's `render`, and engines without V8's structured stack frames keep the frames below, and are reported one growth later as before.
