// @vitest-environment jsdom
//
// Naming the shape, not just the line.
//
// React's missing-key report says a child needs a key. When a generated list has
// been spread in beside children the author wrote out, the child React names is
// often one of the *authored* ones — it has no key because nobody writes keys on
// a heading — and the rows, which do have keys, look innocent. The reader then
// goes looking for a bug in the list.
//
// Our line already says where. This is about saying which of the two shapes it
// is, because the fix differs: keys on the rows, or stop spreading.
import { Div, Span } from '@src/main.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const LIST = '__meo$list'
const LOC = '__meo$loc'
const HERE = 'app/page.tsx:41:7'

function meoLines(build: () => unknown): string[] {
  const seen: string[] = []
  const spies = (['log', 'warn', 'error'] as const).map(level =>
    vi.spyOn(console, level).mockImplementation((...a: unknown[]) => seen.push(a.map(String).join(' '))),
  )
  try {
    renderToStaticMarkup(build() as never)
  } finally {
    spies.forEach(s => s.mockRestore())
  }
  return seen.filter(m => m.includes('[MeoNode]'))
}

const keyedRows = () => ['a', 'b', 'c'].map(id => Span(id, { key: id }))
const unkeyedRows = () => ['a', 'b', 'c'].map(id => Span(id))

describe('the missing-key line', () => {
  it('says the spread is what put the heading in the list, when the rows are keyed and a sibling is not', () => {
    const lines = meoLines(() => Div({ children: [createElement('h2', null, 'Members'), ...keyedRows()], [LIST]: 1, [LOC]: HERE } as never).render())
    const ours = lines.find(m => m.includes(HERE)) ?? ''
    expect(ours).toContain(HERE)
    // The sentence that saves the reader from auditing the rows.
    expect(ours).toMatch(/spread/i)
    expect(ours).toMatch(/nest/i)
  })

  it('does not blame the spread when nothing in the list has a key', () => {
    // A plain `.map()` with no keys. The fix here is keys, not nesting, and
    // saying otherwise would send the reader the wrong way.
    const lines = meoLines(() => Div({ children: unkeyedRows(), [LIST]: 1, [LOC]: HERE } as never).render())
    const ours = lines.find(m => m.includes(HERE)) ?? ''
    expect(ours).toContain(HERE)
    expect(ours).not.toMatch(/spread/i)
  })

  it('stays quiet when every child has a key', () => {
    const lines = meoLines(() => Div({ children: [createElement('h2', { key: 'h' }, 'Members'), ...keyedRows()], [LIST]: 1, [LOC]: HERE } as never).render())
    expect(lines.some(m => m.includes(HERE))).toBe(false)
  })
})
