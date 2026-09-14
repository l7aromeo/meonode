import { Node, Span } from '@meonode/ui'
import { ListHostServer } from '../_components/list-host-server'

const LIST_MARKER = '__meo$list'
const rows = ['alpha', 'beta', 'gamma']

/**
 * A generated list rendered through the server-only styled branch.
 *
 * The marker is set by hand, as the compiled-marker unit tests do, so the case
 * is meaningful whether or not the plugin ran over this fixture.
 */
export default function Page() {
  return Node(ListHostServer, {
    'data-testid': 'list-host',
    css: { color: 'rgb(0, 0, 255)', padding: '4px' },
    [LIST_MARKER]: 1,
    children: rows.map(id => Span(id, { 'data-testid': `row-${id}` })),
  } as never).render()
}
