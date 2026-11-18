import { createNode } from '@src/core.node.js'
import { registerChildrenPassThrough } from '@src/util/children-pass-through.util.js'
import _PortalProvider from '@src/components/portal-provider.client.js'

/**
 * A component that provides portal context to its children.
 * Must wrap any components that use `usePortal()` or `PortalHost`.
 */
export const PortalProvider = createNode(_PortalProvider)

// It renders its children as given, inside its context.
registerChildrenPassThrough(_PortalProvider)
