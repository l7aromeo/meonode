import * as React from 'react'

/**
 * Whether this module instance runs in the React Server Components layer.
 *
 * Bundlers resolve `react` through its `react-server` export condition there, and
 * that build (`react/cjs/react.react-server.production.js` and its development
 * counterpart) omits the client hooks, `useState` among them. Every other build —
 * the server-rendering pass and the browser — exports it. Read once, at load, from
 * the shape of the `react` module this instance was bundled against.
 *
 * This is the server build's module, which the same `react-server` condition
 * selects for `@meonode/ui` itself. It reads the layer rather than assuming it, so
 * the server build stays correct wherever it is loaded. The default build swaps in
 * `react-layer.default.util.ts`, where the value is a constant.
 */
export const IS_REACT_SERVER_LAYER = !('useState' in React)
