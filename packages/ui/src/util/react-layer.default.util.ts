/**
 * `IS_REACT_SERVER_LAYER` in the default build, which the build swaps in for
 * `react-layer.util.ts`.
 *
 * The package ships two builds. Bundlers load the server build in the React Server
 * Components layer, through the `react-server` export condition, and this one
 * everywhere else: the server-rendering pass and the browser. As a constant, the
 * code only the server layer runs folds out of this build and never reaches a
 * browser bundle. The entries guard against this build being loaded in the server
 * layer anyway, in `server-layer-guard.default.ts`.
 */
export const IS_REACT_SERVER_LAYER = false
