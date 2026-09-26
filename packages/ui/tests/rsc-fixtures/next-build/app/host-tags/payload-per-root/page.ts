import { createElement } from 'react'
import { Div } from '@meonode/ui'

const rowCss = (i: number) => ({
  css: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
    borderRadius: 6,
    color: i % 2 ? '#333' : '#555',
    '&:hover': { backgroundColor: '#eee' },
  },
})

/** One row per server component, so each row is its own render and carries its own rule. */
function RowItem({ i }: { i: number }) {
  return Div({ ...rowCss(i), children: `Row ${i}` }).render()
}

/** The same two hundred rows, each rendered by its own server component. */
export default function Page() {
  return Div({ children: Array.from({ length: 200 }, (_, i) => createElement(RowItem, { key: i, i })) }).render()
}
