// How many times `StyledRenderer` renders, for suites that compare compiled
// nodes with their runtime twins: a compiled tree that took the runtime path
// for every node, as it would outside a component render, renders the same and
// passes any comparison, so those suites also check it rendered fewer.
//
// A suite installs the count with
//   vi.mock('@src/components/styled-renderer.client.js', async original =>
//     (await import('./_styled-renders.js')).countingStyledRenderer(original))
// and reads it with `styledRenders()`.
import type * as Renderer from '@src/components/styled-renderer.client.js'

let renders = 0

/**
 * The renderer's module, its default export counting each render.
 * @param original Imports the module as it is.
 * @returns The module, with the counting renderer.
 */
export async function countingStyledRenderer(original: () => Promise<typeof Renderer>): Promise<typeof Renderer> {
  const module = await original()
  const Original = module.default
  const Counted = ((props: Parameters<typeof Original>[0]) => {
    renders++
    return Original(props)
  }) as typeof Original
  ;(Counted as { displayName?: string }).displayName = (Original as { displayName?: string }).displayName
  return { ...module, default: Counted }
}

/**
 * The renders counted since the last read.
 * @returns How many times `StyledRenderer` rendered.
 */
export function styledRenders(): number {
  const count = renders
  renders = 0
  return count
}
