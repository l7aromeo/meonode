import * as React from 'react'

/**
 * Thrown when an entry of the default build loads in the React Server Components
 * layer.
 *
 * That build leaves out the code only the server layer runs, so it would render
 * server components wrongly there: a bundler that resolves `@meonode/ui` through
 * its `react-server` export condition loads the server build instead. This happens
 * when something bypasses that resolution: an alias to a file in `dist/`, or a
 * path to one loaded by Node run with `--conditions=react-server`. Node's ES module
 * loader stops first in that case, since the default build's client modules import
 * hooks the server build of `react` does not export, so there the error is a
 * missing named export instead.
 */
export const SERVER_LAYER_ENTRY_ERROR =
  '[MeoNode] The default entry of @meonode/ui was loaded in the React Server Components layer, which needs its server entry. ' +
  'Import @meonode/ui by its package name, so that its `react-server` export condition selects that entry, ' +
  'rather than through an alias or a path to a file in its dist/ folder.'

// The `react-server` build of `react` omits the client hooks; every other build has them.
if (!('useState' in React)) throw new Error(SERVER_LAYER_ENTRY_ERROR)
