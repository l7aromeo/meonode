---
'@meonode/ui': patch
'@meonode/mui': patch
---

The packages now resolve their types under every TypeScript `moduleResolution`, from ESM and from CommonJS (Fixes #81). The top-level `main` and `types` of `@meonode/ui` named `dist/main.js` and `dist/main.d.ts`, which the package never shipped, and `@meonode/mui` had neither, so a consumer on `moduleResolution: "node"` got `TS2307: Cannot find module '@meonode/ui'`. They now name the shipped CommonJS entry and its declarations, with `module` naming the ESM entry and `typesVersions` mapping each subpath (`@meonode/ui/client`, `@meonode/mui/lab`, …) for that resolution mode.

In `exports`, each condition now names its own declarations first: `import` the ESM `.d.ts`, `require` a CommonJS `.d.cts` written beside it. Before, `types` came after `import` and `require` and was never reached; a CommonJS file under `node16` or `nodenext` resolution was typed against ESM declarations and got `TS1479` on import. Under `node16` and `nodenext`, `import("../main")` references inside the declarations also failed to resolve, so the props and return types of `Div` and the other element factories were `any` there; they now carry the `.js` extension that resolution needs.

The declarations no longer default-import React, which a consumer on `module: "commonjs"` without `esModuleInterop` read as `any`, losing every prop type built on it.
