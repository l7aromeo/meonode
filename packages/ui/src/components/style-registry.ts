import _StyleRegistry from '@src/components/style-registry.client.js'
import { createNode } from '@src/core.node.js'
import { registerChildrenPassThrough } from '@src/util/children-pass-through.util.js'

export const StyleRegistry = createNode(_StyleRegistry)

// It renders its children as given, inside its context.
registerChildrenPassThrough(_StyleRegistry)
