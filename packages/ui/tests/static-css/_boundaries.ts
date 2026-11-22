// Trees where a named node's rule ties with a rule inside a boundary the
// compiler does not see as a component: a memoized node, a Suspense boundary,
// an Activity. Each is marked as the compiler marks it, with a carrier only for
// the first named node after the walk's start or a component. A case's tree
// takes how a node gets its css and what the boundary's content waits for.
import { serializeStyles } from '@emotion/serialize'
import { use, type ReactNode } from 'react'
import { Activity, Div, Node, Span, Suspense, type NodeInstance } from '@src/main.js'
import { ThemeUtil } from '@src/util/theme.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { registerStaticCss } from '@src/util/static-css.util.js'

export type Css = Record<string, unknown>
/** Props for a node of `css`: compiled to its name, and with `carrier` marked to carry what follows it. */
export type Style = (css: Css, options?: { carrier?: boolean }) => Record<string, unknown>
export const runtimeStyle: Style = css => ({ css })
export const compiledStyle: Style = (css, options) => {
  const resolved = ThemeUtil.resolveObjWithTheme(css, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  const { name, styles } = nameStyles(serializeStyles([ThemeUtil.resolveDefaultStyle(ThemeUtil.dropThemedKeys(resolved, () => {}))] as never))
  registerStaticCss(`m-${name}`, [[name, styles]])
  return { __meo$: 2, __meo$n: name, ...(options?.carrier && { __meo$r: 1 }) }
}
const carrier = { carrier: true }

const RED = { color: 'rgb(200, 0, 0)' }
const BLUE = { color: 'rgb(0, 0, 200)' }

/** Renders its children once `data` is in, so a boundary above it suspends until then. */
function Waits({ data, children }: { data: Promise<string>; children?: ReactNode }): ReactNode {
  use(data)
  return children
}

/**
 * How each boundary wraps its content, given what the content waits for, and
 * whether a component is around the content, after which the compiler marks
 * the first named node as a carrier.
 */
type Boundary = [wrap: (content: NodeInstance, data: Promise<string>) => NodeInstance, component: boolean]
const BOUNDARIES: Record<string, Boundary> = {
  'a memoized node': [content => Div({ key: 'b', children: content }, []), false],
  'a Suspense boundary, its content ready': [content => Suspense({ key: 'b', fallback: 'loading', children: content }), false],
  'a Suspense boundary, its content suspended then resolved': [
    (content, data) => Suspense({ key: 'b', fallback: 'loading', children: Node(Waits, { data, children: content }) }),
    true,
  ],
  'a visible Activity': [content => Activity({ key: 'b', mode: 'visible', children: content }), false],
  'a hidden Activity': [content => Activity({ key: 'b', mode: 'hidden', children: content }), false],
}

/** The two placements of the tying node: before the boundary, its `~` rule against the content's own; after it, its `:has` rule. */
const PLACEMENTS: Record<string, (style: Style, boundary: (content: NodeInstance) => NodeInstance, after: { carrier?: boolean }) => NodeInstance> = {
  'a named node before it': (style, boundary, after) =>
    Div({
      className: 'wrapper',
      children: [
        Span('s', { key: 's', 'data-n': 's', ...style({ '& ~ * .item': RED }, carrier) }),
        boundary(Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper > * &': BLUE }, after) })),
      ],
    }),
  'a named node after it': (style, boundary, after) =>
    Div({
      className: 'wrapper',
      children: [
        Span('h', { key: 'h', 'data-n': 'h', ...style({ order: 1 }, carrier) }),
        boundary(Div({ 'data-n': 'i', className: 'item', ...style({ '.wrapper:has(.t) &': BLUE }, after) })),
        Span('t', { key: 't', 'data-n': 't', className: 't', ...style({ '.wrapper:has(&) .item': RED }, after) }),
      ],
    }),
}

/** Every case: the tree for a style and what the content waits for. */
export const CASES: [name: string, tree: (style: Style, data: Promise<string>) => NodeInstance][] = Object.entries(BOUNDARIES).flatMap(
  ([b, [wrap, component]]) =>
    Object.entries(PLACEMENTS).map(
      ([p, placement]) =>
        [`${p}, ${b}`, (style: Style, data: Promise<string>) => placement(style, content => wrap(content, data), component ? carrier : {})] as const,
    ),
) as never
