---
'@meonode/ui': patch
---

Render styled elements through the CommonJS build. `require('@meonode/ui')` loaded, but the first element with a `css` prop or a style prop threw `TypeError: e is not a function`, in Node and in a bundler that resolves the package's `require` condition (a CommonJS module in a Next.js app, for one). The CommonJS build read `@emotion/cache` and `@emotion/unitless` as their whole `module.exports` rather than their default export, so it called an object as the cache factory and looked up unitless properties one level too high. It now takes a dependency's `.default` when the dependency marks itself as a compiled ES module, and the whole `module.exports` otherwise, as the ES module build does.

Fixes #86.
