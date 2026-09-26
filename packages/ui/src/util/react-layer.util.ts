import * as React from 'react'

/**
 * Whether this module instance runs in the React Server Components layer.
 *
 * Bundlers resolve `react` through its `react-server` export condition there, and
 * that build (`react/cjs/react.react-server.production.js` and its development
 * counterpart) omits the client hooks, `useState` among them. Every other build —
 * the server-rendering pass and the browser — exports it. Read once, at load, from
 * the shape of the `react` module this instance was bundled against.
 */
export const IS_REACT_SERVER_LAYER = !('useState' in React)
