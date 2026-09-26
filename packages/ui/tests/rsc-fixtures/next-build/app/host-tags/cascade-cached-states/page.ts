import { createNode, Div } from '@meonode/ui'

/**
 * `/host-tags/cascade-cached` with a component whose own css also sets the colour
 * on hover and inside a media query. Composed, the caller's colour wins at rest,
 * and the component's own nested rules still win where they apply.
 */
async function CachedCard({ className, children }: { className?: string; children?: string }) {
  'use cache'
  return Div({
    className,
    'data-testid': 'conflict',
    color: 'rgb(0, 128, 128)',
    css: { '&:hover': { color: 'rgb(0, 0, 255)' }, '@media (min-width: 600px)': { color: 'rgb(0, 128, 0)' } },
    children,
  }).render()
}

const CachedCardNode = createNode(CachedCard)

export default function Page() {
  return CachedCardNode({ css: { color: 'rgb(255, 165, 0)' }, children: 'conflict' }).render()
}
