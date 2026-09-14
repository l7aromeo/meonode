import { createElement, type ReactNode } from 'react'

/**
 * Same role as ListHostServer, but renders children with plain React instead
 * of handing them to another MeoNode node.
 */
export function ListHostPlain({ children }: { children?: ReactNode }) {
  return createElement('div', { 'data-testid': 'list-host' }, children as never)
}
