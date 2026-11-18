/**
 * The entries' check that they were loaded in the layer their build is for.
 *
 * Every entry imports this module first. The server build, and the source the
 * tests run, may load in any layer, so here it checks nothing. The default build
 * swaps in `server-layer-guard.default.ts`, which refuses the React Server
 * Components layer.
 */
export {}
