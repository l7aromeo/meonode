import { Suspense } from 'react'
import { connection } from 'next/server'
import { Div, Node } from '@meonode/ui'
import { later } from '../_shared/late'
import { PALETTES, wrappedRows } from '../_shared/rows'

/** Request-time server-compiled rules, compiled after a macrotask — paired with `/dynamic-a`. */
async function Rows() {
  await connection()
  await later()
  return Div({ children: wrappedRows('dynamic b row', PALETTES.dynamicB) }).render()
}

export default function Page() {
  return Node(Suspense, { fallback: null, children: Node(Rows) }).render()
}
