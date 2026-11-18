import * as React from 'react'
import { Fragment as BaseFragment, Suspense as BaseSuspense } from 'react'
import { createNode } from '@src/core.node.js'

type ActivityType = typeof React.Activity

/**
 * React's `<Activity>` element type, the registered symbol `react.activity`.
 *
 * Some Reacts do not export `Activity`: React 19.2's `react-server` builds, and the
 * 19.2 canary that Next.js 15 renders with. A named import of a missing export fails to
 * link, and webpack also checks a member read of the namespace, `React.Activity` or
 * `React['Activity']`, against the module's exports, failing the build of this
 * `"type": "module"` package. `Reflect.get` reads the export without either check, and
 * only once `in` has found it, since a module namespace stand-in, such as a test
 * runner's module mock, may throw on reading a name it lacks.
 * Where the export is missing, the registered symbol stands in. It is the value every
 * build that exports `Activity` exports, and Flight sends an element type as that
 * symbol's name, which the client reads back with `Symbol.for`, so the element renders
 * as the client's `<Activity>`.
 */
const BaseActivity: ActivityType =
  'Activity' in React ? (Reflect.get(React, 'Activity') as ActivityType) : (Symbol.for('react.activity') as unknown as ActivityType)

/**
 * A container that does not render any extra DOM element.
 * @see {@link https://react.dev/reference/react/Fragment React Docs}
 * @example
 *
 * ```typescript
 * import { Fragment, Div, Span } from '@meonode/ui';
 *
 * Fragment({
 *   children: [
 *     Div('First Div'),
 *     Span('A Span inside Fragment'),
 *     Div('Second Div'),
 *   ],
 * })
 * ```
 */
export const Fragment = createNode(BaseFragment)

/**
 * Lets you hide and restore the UI and internal state of its children.
 * @see {@link https://react.dev/reference/react/Activity React Docs}
 * @example
 *
 * ```typescript
 * import { Activity } from '@meonode/ui';
 *
 * Activity({
 *   mode: isShowingSidebar ? "visible" : "hidden",
 *   children: Div(...),
 * })
 * ```
 */
export const Activity = createNode(BaseActivity)

/**
 * Lets you display a fallback until its children have finished loading.
 * @see {@link https://react.dev/reference/react/Suspense React Docs}
 * @example
 *
 * ```typescript
 * import { Suspense } from '@meonode/ui';
 *
 * Suspense({
 *   fallback: 'Loading...',
 *   children: Div(...),
 * })
 * ```
 */
export const Suspense = createNode(BaseSuspense)
