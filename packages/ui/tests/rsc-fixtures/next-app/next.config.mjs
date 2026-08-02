import { URL } from 'node:url'

// Widen Turbopack's compile scope to the repo root so files under
// packages/ui/src are reachable (the webpack equivalent was
// `experimental.externalDir`).
//
// This has to be the *monorepo* root, not the ui package root. `root` bounds
// where Turbopack will look for modules, and the installer hoists shared
// dependencies to the repo-level `node_modules` — so stopping at packages/ui
// puts ui's own peers out of scope and the dev server fails to start with
// `Module not found: Can't resolve '@emotion/cache'`.
//
// The `resolveAlias` entries below are resolved relative to this fixture
// directory rather than to `root`, so they are unaffected by how far up this
// points.
const workspaceRoot = new URL('../../../../..', import.meta.url).pathname

// Opt the fixture into compiled call sites, so the RSC suite can be run a
// second time against real plugin output. Off by default: the uncompiled run
// stays the baseline, and enabling it unconditionally would mean the suite no
// longer covers what most apps ship today.
const compiled = process.env.MEONODE_COMPILED === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Package name, not a resolved path — Turbopack resolves the plugin itself
  // and fails on an absolute path.
  ...(compiled ? { experimental: { swcPlugins: [['@meonode/compiler', {}]] } } : {}),
  turbopack: {
    root: workspaceRoot,
    // Point at the built dist so Turbopack never has to rewrite `.js` → `.ts`
    // (it has no webpack-style `extensionAlias`). `globalSetup.rsc.ts` runs
    // `bun run build` before the suite, so dist/esm is always current.
    resolveAlias: {
      '@meonode/ui': '../../../dist/esm/main.js',
      '@meonode/ui/nextjs-registry': '../../../dist/esm/nextjs-registry/index.js',
    },
  },
}

export default nextConfig
