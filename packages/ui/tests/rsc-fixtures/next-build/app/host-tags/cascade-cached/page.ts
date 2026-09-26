import { createNode, Div } from '@meonode/ui'

/**
 * The cascade case with the component inside a `'use cache'` scope and its
 * caller outside it. The scope has its own request cache, so the caller's class
 * is compiled in one cache and the component's own css in another.
 */
async function CachedCard({ className, children }: { className?: string; children?: string }) {
  'use cache'
  return Div({ className, 'data-testid': 'conflict', color: 'rgb(0, 128, 128)', children }).render()
}

const CachedCardNode = createNode(CachedCard)

export default function Page() {
  return CachedCardNode({ css: { color: 'rgb(255, 165, 0)' }, children: 'conflict' }).render()
}
