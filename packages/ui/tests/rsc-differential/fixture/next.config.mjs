// One build per (library version × compiled × Cache Components). The harness
// sets these, and each build gets its own distDir so they can be served at once.
const compiled = process.env.MEONODE_COMPILED === '1'
const cacheComponents = process.env.MEONODE_CACHE_COMPONENTS === '1'

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: false,
  cacheComponents,
  typescript: { ignoreBuildErrors: true },
  distDir: process.env.MEONODE_DIST_DIR || '.next',
  experimental: {
    // `'use cache'` cases need the directive in the build without Cache Components too.
    ...(cacheComponents ? {} : { useCache: true }),
    ...(compiled ? { swcPlugins: [['@meonode/compiler', {}]] } : {}),
  },
  turbopack: { root: import.meta.dirname },
}
