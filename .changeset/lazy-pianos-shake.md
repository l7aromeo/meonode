---
'@meonode/ui': patch
---

Remove four internal members left behind when the element cache was replaced.

`NodeUtil.hashString`, `NodeUtil.hashCSS`, `NodeUtil.isStyleProp` and
`NodeUtil.shouldNodeUpdate` all existed to serve the derived-key element
cache — hashing props into a lookup string, and deciding whether a node's
dependency list allowed it to be skipped. Nothing computes a key or a
signature any more, so all four lost their last caller and shipped inert.

Confirmed dead before removing: each appears exactly once across `src`,
`tests`, `scripts` and `bench` — its own definition — and zero times in
`@meonode/mui`, `@meonode/compiler` or the documentation site. `NodeUtil`
is not exported from any package entry (`.`, `./client`,
`./nextjs-registry`), so none of them were reachable from outside the
package and no consumer can be relying on them.

No behaviour change. All suites pass unchanged: 270 unit, 271 compiled,
76 RSC in each mode.
