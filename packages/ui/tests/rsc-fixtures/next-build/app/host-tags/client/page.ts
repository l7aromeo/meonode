import { createElement } from 'react'
import { ClientTree } from './tree'

export default function Page() {
  return createElement(ClientTree, { label: 'client host tags' })
}
