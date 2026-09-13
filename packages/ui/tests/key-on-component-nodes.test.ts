// @vitest-environment jsdom
//
// MeoNode does not *require* a `key` on children you wrote out: authored
// siblings are spread variadically into `createElement(target, props,
// ...children)`, which is React's own signal that a human listed them, so it
// never demands one. But not requiring it is different from refusing it — a
// caller who wants to pin identity across a reorder must be able to say so, on
// any kind of node.
//
// That promise is about children the author listed. A *generated* list —
// `items.map(fn)` — is reported, because position is not identity there: delete
// a row and the survivors inherit the previous row's state. The compiler marks
// those call sites and the runtime hands them to React as one array so it can
// ask. See `list-detection.test.ts`; the cases at the bottom of this file pin
// down both sides of the line, so that neither is later "fixed" into the other.
//
// Two things stopped that working on `Component`:
//
//   1. `ComponentNodeProps<TProps>` did not include `key`, so passing one was a
//      type error: `'key' does not exist in type 'TProps & ...'`.
//   2. Even cast past the types it had no effect. A factory child stays a
//      BaseNode and is rendered inside its parent's loop unwrapped, so its key
//      reaches React. A `Component` child has already called `.render()`, so
//      what landed in the children array was a wrapper element, and the wrapper
//      carried no key — leaving React with an unkeyed element. `MeoMemo` is the
//      wrapper today, for any node given `deps`, and it forwards the key.
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { Div, Component } from '@src/main.js'
import type { NodeElement } from '@src/types/node.type.js'

const Item = Component<{ id: string }>(({ id }) => Div({ 'data-testid': `i-${id}`, children: id }))

/** Renders ['a','b'], re-renders reversed, reports whether 'a' kept its DOM node. */
function keepsIdentityAcrossReorder(build: (id: string) => NodeElement, testId: (id: string) => string) {
  const App = ({ reversed }: { reversed: boolean }) => Div({ children: (reversed ? ['b', 'a'] : ['a', 'b']).map(build) }).render() as never

  const view = render(createElement(App, { reversed: false }))
  const before = view.getByTestId(testId('a'))
  view.rerender(createElement(App, { reversed: true }))
  const same = view.getByTestId(testId('a')) === before
  view.unmount()
  return same
}

describe('key on Component nodes', () => {
  it('is accepted without a cast', () => {
    // The compile-time half. `key` is not part of the component's own props, so
    // it has to come from `ComponentNodeProps`. If this stops type-checking the
    // type regressed, whatever the runtime does.
    const node = Item({ key: 'k1', id: 'a' })

    expect(node).toBeDefined()
  })

  it('pins DOM identity across a reorder', () => {
    expect(
      keepsIdentityAcrossReorder(
        id => Item({ key: id, id }),
        id => `i-${id}`,
      ),
    ).toBe(true)
  })

  it('matches a factory node, which already worked', () => {
    expect(
      keepsIdentityAcrossReorder(
        id => Div({ key: id, 'data-testid': `f-${id}`, children: id }),
        id => `f-${id}`,
      ),
    ).toBe(true)
  })

  // Each of the two cases below renders under a tag no other uses. React
  // deduplicates its missing-key report by the name of the PARENT the list
  // reconciled under, once per process, so two cases sharing a `<div>` would
  // leave the second proving nothing — and the second here is the one asserting
  // silence, which is exactly the direction that fails invisibly.
  function keyReports(parentTag: string, build: (as: string) => unknown): string[] {
    const messages: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      messages.push(a.map(String).join(' '))
    })
    const view = render(build(parentTag) as never)
    spy.mockRestore()
    view.unmount()
    return messages.filter(m => /unique "key"/i.test(m))
  }

  it('stays optional on children the caller wrote out', () => {
    // The ergonomic promise, expressed with the children it is actually about:
    // siblings listed at the call site. Omitting `key` on those is still fine
    // and still silent, because they go out variadically and React reads that
    // as a human having listed them.
    //
    // This case used to render `['a', 'b'].map(id => Item({ id }))` — a
    // generated list — and assert the same silence. That passed only while the
    // runtime could not tell the two apart, and asserted the absence of the
    // feature this file now documents.
    expect(keyReports('key-opt-authored', as => Div({ as, children: [Item({ id: 'a' }), Item({ id: 'b' })] } as never).render())).toEqual([])
  })

  it('is required of a generated list, which is not the same promise', () => {
    // The companion, and the reason the case above is written the way it is: if
    // someone later restores the old assertion, this fails rather than the
    // feature quietly disappearing.
    //
    // Only the compiler can mark a call site as generated, so what to expect
    // depends on whether this build's plugin emits the marker — which is not the
    // same question as whether the suite is running compiled. A compiler
    // predating the marker compiles these tests happily and emits nothing, so
    // keying off `MEONODE_COMPILED` would fail against it for the wrong reason.
    //
    // Asked directly instead: mark a `.map()` call site exactly as the case
    // below does and look at whether the marker landed on it. Then assert the
    // behaviour that answer implies, so this case is meaningful uncompiled,
    // compiled by an older plugin, and compiled by one that marks lists.
    const probe = Div({ children: ['probe'].map(id => Item({ id })) })
    const marksGeneratedLists = '__meo$list' in (probe.rawProps as Record<string, unknown>)

    const reports = keyReports('key-opt-generated', as => Div({ as, children: ['a', 'b'].map(id => Item({ id })) } as never).render())

    if (marksGeneratedLists) {
      expect(reports.length).toBeGreaterThan(0)
    } else {
      expect(reports).toEqual([])
    }
  })

  it('does not reach the component as a prop', () => {
    // `key` is React's, never the component's.
    let seen: Record<string, unknown> | undefined
    const Probe = Component<{ id: string }>(props => {
      seen = props as Record<string, unknown>
      return Div({ children: props.id })
    })

    render(Div({ children: [Probe({ key: 'k1', id: 'a' })] }).render() as never)

    expect(seen).toBeDefined()
    // Checked by own-key enumeration, not `in`: React 19 installs a warning
    // getter named `key` on every props object, so `'key' in props` is true
    // even when no key was passed.
    expect(Object.keys(seen!)).toEqual(['id'])
    expect(seen!.key).toBeUndefined()
    expect(seen!.id).toBe('a')
  })
})
