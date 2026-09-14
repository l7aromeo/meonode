---
'@meonode/ui': patch
---

Report a throwing function-as-a-child, and stop paying to ask whether to.

A function child that threw had its error swallowed and its result replaced with
`null`, so the element vanished from the page with nothing printed unless
`setDebugMode` happened to be on — and nobody discovers `setDebugMode` from a
blank space. The error belongs to the caller, so it now appears in development
like any other diagnostic. MeoNode's own recovery paths stay behind
`setDebugMode`: a compiled marker bucket collision, a failed prototype probe and
a key-name fallback are the library recovering from itself, and nobody outside it
can act on them.

Separately, `diagnosticsEnabled()` read `process.env.NODE_ENV` on every call,
which in Node is a native `getenv` rather than a property read — roughly 112ns
against 0.9ns for a boolean. It is consulted at every recursion level of the
theme diagnostics, once per styled node, on every render, while the function's
own documentation claimed production cost a single boolean check. The
environment is now read once. `setDebugMode` still takes effect at runtime.
