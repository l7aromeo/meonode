---
'@meonode/ui': minor
---

Smaller client bundles. `@meonode/ui` now ships a separate build for the React Server Components layer, which bundlers select through the `react-server` export condition. The code only server components run, which compiles their `css` into class names and places the rules, now stays out of the browser. In a Next.js 16 app, with Turbopack or webpack, each App Router page loads 1.3 to 1.8 KB less gzipped JavaScript, and a Pages Router page about 3.4 KB less. Fixes #82.

Imports stay the same. Next.js, with Turbopack or webpack, and Vite with `@vitejs/plugin-rsc` pick the right build, as does Node run with `--conditions=react-server`.

The default build now refuses to load in the React Server Components layer, with an error that says why and what to change. That happens when something bypasses the package's own resolution, such as an alias pointing `@meonode/ui` at a file in its `dist/` folder, or Node run with `--conditions=react-server` loading one of those files by its path. Node's ES module loader stops earlier in that last case, with a `SyntaxError` naming a hook that the server build of `react` does not export, such as `Named export 'useLayoutEffect' not found`.
