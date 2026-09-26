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

/** Two hundred styled host rows in one render: the shape of a long server-rendered list. */
export default function Page() {
  return Div({ children: Array.from({ length: 200 }, (_, i) => Div({ key: i, ...rowCss(i), children: `Row ${i}` })) }).render()
}
