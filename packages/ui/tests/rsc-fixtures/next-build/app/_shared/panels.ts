import { createElement, type ReactNode } from 'react'
import { createNode, Div } from '@meonode/ui'
import type { Closed, Open } from './slots'

function ServerPanel(props: { children?: ReactNode; className?: string }) {
  return createElement('div', props)
}
const Panel = createNode(ServerPanel)

const SHARED = { color: 'rgb(12, 34, 56)', padding: '3px' }

/**
 * A panel rendered by its own `.render()` call and handed to `holder`, followed
 * by a visible element with the same css. The panel is rendered first, so it is
 * the first render in the request to compile the shared rule.
 */
export const panelThenVisible = (holder: typeof Closed | typeof Open) =>
  Div({
    children: [
      createElement(holder, { key: 'holder', panel: Panel({ css: SHARED, children: 'panel' }).render() }),
      Panel({ key: 'visible', css: SHARED, 'data-testid': 'visible', children: 'visible' } as never),
    ],
  }).render()
