import { URL } from 'node:url'

// The production-build counterpart to `next-app`. That fixture runs `next dev`,
// which never prerenders, so nothing about a statically generated page — the
// build output these issues are about — is reachable from it.
//
// Built twice by the harness: once with Cache Components and once without, each
// into its own `distDir`, because #35 is precisely the difference between the
// two and a single build cannot show it.
const workspaceRoot = new URL('../../../../..', import.meta.url).pathname
const compiled = process.env.MEONODE_COMPILED === '1'
const cacheComponents = process.env.MEONODE_CACHE_COMPONENTS === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  cacheComponents,
  // This fixture exists for what a production build *emits*. Next would
  // otherwise typecheck the library's source through the `paths` mapping,
  // against this fixture's own React types; the library is typechecked by the
  // repository's lint, where it is checked against the versions it declares.
  typescript: { ignoreBuildErrors: true },
  distDir: process.env.MEONODE_DIST_DIR || '.next',
  experimental: {
    // `/wrapped-late` needs `'use cache'` in both builds. Cache Components turns
    // the directive on itself; without it this flag does, and it enables the
    // directive alone — not the two-pass prerender that is #35's subject — so the
    // plain build stays the comparison #35 needs.
    useCache: true,
    ...(compiled ? { swcPlugins: [['@meonode/compiler', {}]] } : {}),
  },
  turbopack: {
    root: workspaceRoot,
    resolveAlias: {
      '@meonode/ui': '../../../dist/esm/main.js',
      '@meonode/ui/nextjs-registry': '../../../dist/esm/nextjs-registry/index.js',
    },
  },
}

export default nextConfig
