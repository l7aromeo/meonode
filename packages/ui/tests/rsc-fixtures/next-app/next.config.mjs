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
const workspaceRoot = new URL('../../../../..', import.meta.url).pathname

// Opt the fixture into compiled call sites, so the RSC suite can be run a
// second time against real plugin output. Off by default: the uncompiled run
// stays the baseline, and enabling it unconditionally would mean the suite no
// longer covers what most apps ship today.
const compiled = process.env.MEONODE_COMPILED === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // `next dev` otherwise writes an AGENTS.md into this fixture when it detects a
  // coding agent in the environment.
  agentRules: false,
  // Package name, not a resolved path — Turbopack resolves the plugin itself
  // and fails on an absolute path.
  ...(compiled ? { experimental: { swcPlugins: [['@meonode/compiler', {}]] } } : {}),
  turbopack: {
    root: workspaceRoot,
    // No alias for `@meonode/ui`: it resolves through the workspace link to the
    // package and its exports map, so the server layer loads the server build
    // through the `react-server` condition and the client tree the default one,
    // as in an app. The setup runs `bun run build` before the suite, so dist/ is current.
  },
}

export default nextConfig
