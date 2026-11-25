---
"@meonode/compiler": patch
---

With `experimental_extractCss`, the import the compiler adds from `@meonode/ui` now goes after the module's directives, such as `'use client'` and `'use strict'`. It went first, above the directive, so the directive stopped being one, and Next.js with webpack refused the build ("The "use client" directive must be placed before other expressions"). Turbopack builds kept such modules as client modules, and their output is unchanged. A module with no directive is unchanged (Fixes [#176](https://github.com/l7aromeo/meonode/issues/176)).
