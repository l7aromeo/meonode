import { createNode, Div, type CssProp } from '@meonode/ui'

/**
 * `/host-tags/cascade-cached` with the caller's styles passed into the cached
 * component as a prop it applies as `css`, rather than as a `className`. The
 * component then compiles both in its own cache, as one class.
 */
async function CachedCard({ extraCss, children }: { extraCss?: CssProp; children?: string }) {
  'use cache'
  return Div({ 'data-testid': 'conflict', color: 'rgb(0, 128, 128)', css: extraCss, children }).render()
}

const CachedCardNode = createNode(CachedCard)

export default function Page() {
  return CachedCardNode({ extraCss: { color: 'rgb(255, 165, 0)' }, children: 'conflict' }).render()
}
