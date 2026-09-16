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

describe('without callSiteLocations, which is how most builds run', () => {
  // The location needs the plugin option; the explanation does not. It needs the
  // list marker, which every compiled build emits. Withholding the useful half
  // because the ornamental half is unavailable is the complaint that started
  // this: the report knew the shape and said nothing.
  it('still explains the shape when the rows are keyed and a sibling is not', () => {
    const lines = meoLines(() => Div({ children: [createElement('h2', null, 'Members'), ...keyedRows()], [LIST]: 1 } as never).render())
    const ours = lines.find(m => m.includes('[MeoNode]')) ?? ''
    expect(ours).toMatch(/spread/i)
    expect(ours).toMatch(/nest/i)
    // It must not read like a located diagnostic that lost its location, or
    // someone files the missing line number as the bug.
    expect(ours).not.toMatch(/at undefined|call site it came from/i)
    // And it should say how to get the line, since that is one option away.
    expect(ours).toMatch(/callSiteLocations/)
  })

  it('stays silent when nothing in the list has a key', () => {
    // React already says the right thing here, and a second voice repeating it
    // without a line number is pure noise.
    const lines = meoLines(() => Div({ children: unkeyedRows(), [LIST]: 1 } as never).render())
    expect(lines.filter(m => m.includes('[MeoNode]'))).toEqual([])
  })

  it('stays silent when every child is keyed', () => {
    const lines = meoLines(() => Div({ children: [createElement('h2', { key: 'h' }, 'Members'), ...keyedRows()], [LIST]: 1 } as never).render())
    expect(lines.filter(m => m.includes('[MeoNode]'))).toEqual([])
  })
})

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
