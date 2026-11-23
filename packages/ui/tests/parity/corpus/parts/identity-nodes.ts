// A factory from a local module, so the compiler joins its calls (`__meoFactoryCall`) with extraction on.
import { createNode } from '@meonode/ui'

export const F = createNode('div', {})
