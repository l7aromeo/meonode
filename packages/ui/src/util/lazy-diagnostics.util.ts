/**
 * The development diagnostics as a production build loads them, when debug
 * mode turns on.
 *
 * `diagnostics.util.ts` imports them statically too, for development, and that
 * import is left unused in production. Rolldown, and so Vite 8, places a
 * module in a chunk by its static imports, used or not, so a lazy load of the
 * diagnostics' own module would leave them in the bundle that loads first.
 * Loading this module instead gives the diagnostics a static import that only
 * the lazy load reaches.
 */
export * from '@src/util/development-diagnostics.util.js'
