import {
  cache,
  cloneElement,
  type ComponentProps,
  createElement,
  type ElementType,
  type ExoticComponent,
  Fragment,
  type FragmentProps,
  isValidElement,
  type Key,
  type ReactElement,
  type ReactNode,
} from 'react'
import type {
  Children,
  DependencyList,
  FinalNodeProps,
  HasRequiredProps,
  MergedProps,
  NodeElementType,
  NodeInstance,
  NodeProps,
  PolymorphicProps,
  PropsOf,
  Theme,
  WorkItem,
} from '@src/types/node.type.js'
import { isFragment, isValidElementType, REACT_LAZY_TYPE } from '@src/helper/react-is.helper.js'
import { getComponentType, getElementTypeName, hasNoStyleTag, getGlobalState, omitUndefined } from '@src/helper/common.helper.js'
import StyledRenderer, { ThemedRule, ThemeTokenCheck } from '@src/components/styled-renderer.client.js'
import MeoMemo from '@src/components/meo-memo.client.js'
import { INITIAL_PROPS_MARKER, isDevMode, LIST_MARKER, LOCATION_MARKER, STATIC_CLASSES_MARKER, STATIC_VARS_MARKER } from '@src/constant/common.const.js'
import { checkCss, checkFactoryCss, isMergeableCss, markCombinedCssChecked } from '@src/util/css.util.js'
import { NodeUtil } from '@src/util/node.util.js'
import { IS_REACT_SERVER_LAYER } from '@src/util/react-layer.util.js'
import { passesChildrenThrough } from '@src/util/children-pass-through.util.js'
import { observeChildren } from '@src/util/generated-list.util.js'
import { compileServerEmotionRule } from '@src/util/server-emotion.util.js'
import { hasStaticCss, modulesOfClasses } from '@src/util/static-css.util.js'
import { StaticStyles } from '@src/components/static-styles.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { collectThemeVarRefs, diagnosticsEnabled, getThemeVarIndex, reportThemeIssues, reportUnresolvedThemeKey } from '@src/util/theme-diagnostics.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'

/**
 * Hosts that cannot carry a rule in their children: void elements, elements
 * whose children React treats as text or never renders, and the document
 * scaffold. Anything inside `svg` or `math` is excluded separately, because a
 * `<style>` there is an SVG or MathML element that renders in place instead of
 * being hoisted, which would put the rule at a cascade position of its own.
 */
const RULE_ANCHOR_EXCLUDED = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
  'textarea',
  'option',
  'title',
  'style',
  'script',
  'noscript',
  'template',
  'html',
  'head',
  'svg',
  'math',
])

/**
 * Whether a server-compiled rule can travel in this element's children.
 *
 * A host renders every child it is given, so a rule placed among a host's
 * children renders whenever anything inside that host does. That is what lets a
 * rule sit with an ancestor of the element that uses it rather than beside it,
 * leaving the element itself exactly as it would be without the rule.
 */
function canAnchorRules(renderTarget: unknown, props: Record<string, unknown>, inForeignNamespace: boolean): boolean {
  return (
    typeof renderTarget === 'string' &&
    !inForeignNamespace &&
    !RULE_ANCHOR_EXCLUDED.has(renderTarget) &&
    !('dangerouslySetInnerHTML' in props && props.dangerouslySetInnerHTML != null)
  )
}

/**
 * Whether the theme can differ inside this element from outside it.
 *
 * A component can render a provider around its children, a nested
 * `ThemeProvider` being the case that matters, so its children may read another
 * theme than its parent does. A host element and the built-in symbols (fragments,
 * Suspense, StrictMode) supply no context.
 */
function mayChangeTheme(renderTarget: unknown): boolean {
  return typeof renderTarget === 'function' || (typeof renderTarget === 'object' && renderTarget !== null)
}

/**
 * The `<style>` element for a rule, one object per request.
 *
 * Every anchor that needs a rule gets it, so a subtree the client does not
 * render cannot take another subtree's only copy with it. Reusing one element
 * object for all of them lets the RSC payload carry the rule once and refer back
 * to it. Its key and `href` are the class the rule defines, never the element's
 * whole `className`, so React hoists and dedupes it by that class whatever else
 * the element carries.
 */
const requestRuleElements = cache((): Map<string, ReactElement> => new Map())
function ruleElement(rule: { id: string; ownClassName: string; cssText: string }): ReactElement {
  const elements = requestRuleElements()
  let element = elements.get(rule.id)
  if (!element) {
    element = createElement('style', { key: rule.ownClassName, href: rule.ownClassName, precedence: 'meonode' }, rule.cssText)
    elements.set(rule.id, element)
  }
  return element
}

/** The key of a host's slot for the static css its render uses, among its carried rules. */
const STATIC_STYLES_KEY = 'mn-static'

/**
 * Adds a compiled node's extracted styles to its element's props: the static
 * classes before the element's own `className`, and the variables those rules
 * read under the element's own `style`, which wins a conflict.
 * @param props The element's props, a fresh object this render owns.
 */
function addStaticProps(props: Record<string, unknown>, classes: string | undefined, vars: Record<string, unknown> | undefined): void {
  if (classes !== undefined) {
    const own = props.className
    props.className = typeof own === 'string' && own !== '' ? `${classes} ${own}` : classes
  }
  if (vars !== undefined) {
    const own = props.style
    props.style = own != null && typeof own === 'object' ? { ...vars, ...own } : vars
  }
}

const RENDER_CONTEXT_POOL_KEY = Symbol.for('@meonode/ui/BaseNode/renderContextPool')

/**
 * Every `BaseNode` reachable in a children array, including inside nested arrays.
 *
 * A nested array is a list of children in its own right, so its members render
 * like any other child and have to be queued alongside them. Flat arrays — the
 * overwhelming majority — are returned untouched, so nothing is allocated for
 * the common shape.
 * @param children The children array to scan.
 * @returns The original array when it holds no arrays, otherwise a flat list of
 * its members with nesting walked through.
 */
function collectNodeChildren(children: readonly unknown[]): readonly unknown[] {
  if (!children.some(Array.isArray)) return children
  const out: unknown[] = []
  const seen = new WeakSet<object>()
  const walk = (list: readonly unknown[]) => {
    if (seen.has(list)) return
    seen.add(list)
    for (const child of list) {
      if (Array.isArray(child)) walk(child)
      else out.push(child)
    }
  }
  walk(children)
  return out
}

/**
 * Swaps rendered elements in for `BaseNode` instances, keeping arrays nested.
 *
 * The nesting is preserved deliberately: React reads a nested array as a list
 * whose siblings are not part of it, and flattening here would hand React the
 * same shape a spread does — which is exactly the shape that loses React's
 * missing-key exemption for those siblings.
 * @param child One member of a children array.
 * @param rendered The map populated during the begin phase.
 * @returns The member with any node instances replaced by their elements.
 */
function assertNoNodeInHostProps(props: Record<string, unknown>, location: unknown): void {
  for (const key in props) {
    const value = props[key]
    if (!NodeUtil.isNodeInstance(value)) continue
    const where = typeof location === 'string' ? ` at ${location}` : ''
    throw new Error(
      `[MeoNode] The \`${key}\` prop${where} was given a node (${getElementTypeName(value.element)}). ` +
        `This element is a plain HTML tag, so the prop becomes an attribute and the node stringifies to "[object Object]" — ` +
        `silently, which is why this throws instead. Move it into \`children\`, or call \`.render()\` if you meant to pass an element.`,
    )
  }
}

/** A React element in development, which records whether React checks its key. */
type DevElement = ReactElement & { _store?: { validated?: number } }

/**
 * One element child being copied where its node renders: the element, a box
 * holding its children once they are laid out, and the slot its copy goes into.
 */
interface CopyFrame {
  element: ReactElement
  box: unknown[] | undefined
  into: unknown[] | undefined
  at: number
}

/**
 * An element child's `children` as the element holds them, with every list a
 * fresh array so copies can be put in its slots: a list of one stays a list,
 * and a falsy child stays a child.
 */
function copyLayout(element: ReactElement): unknown {
  const children = (element.props as { children?: unknown }).children
  if (!Array.isArray(children)) return children
  return children.map(function copyList(child: unknown): unknown {
    return Array.isArray(child) ? child.map(copyList) : child
  })
}

/** Queues a frame for every element in `list` and the lists nested in it, each copied into its slot. */
function queueCopies(list: unknown[], queue: CopyFrame[]): void {
  const lists: unknown[][] = [list]
  while (lists.length > 0) {
    const current = lists.pop() as unknown[]
    for (let i = 0; i < current.length; i++) {
      const child = current[i]
      if (Array.isArray(child)) lists.push(child)
      else if (isValidElement(child) && !NodeUtil.isFinalizedElement(child)) queue.push({ element: child, box: undefined, into: current, at: i })
    }
  }
}

/**
 * The props a built element is rebuilt with, from its own props: under `props`
 * for a target that shields its own props, and without `theme` on a plain tag.
 * A built element's props are final, so its key and a plain tag's attributes
 * reach React as written. Only style values have `theme.*` tokens turned into
 * CSS variables: a plain tag's inline `style`, and the props of a component,
 * which may take style values under any name (MUI's `sx`, an icon's `color`).
 * @param type The element's type.
 * @param key The element's key.
 * @param own The element's props, without `children` and `undefined` entries.
 * @returns The props to create the element with, key included.
 */
function builtElementProps(type: unknown, key: Key | null | undefined, own: Record<string, unknown>): Record<string, unknown> {
  if (typeof type === 'string') {
    const props: Record<string, unknown> = { key: key ?? undefined, ...own }
    if (own.style !== undefined) props.style = replaceThemeTokensWithCssVars(own.style)
    if ('theme' in props) delete props.theme
    return props
  }
  const converted = replaceThemeTokensWithCssVars(own)
  return { key: key ?? undefined, ...(NodeUtil.shieldsOwnProps(type) ? { props: converted } : converted) }
}

/** The props of an element child's copy: the element's own, as {@link builtElementProps} rebuilds them. */
function copyProps(element: ReactElement): Record<string, unknown> {
  const { children: _children, ...finalProps } = element.props as Record<string, unknown>
  return builtElementProps(element.type, element.key, omitUndefined(finalProps))
}

/**
 * Copies every queued element child into its slot, children first, as the walk
 * builds each one from a node wrapping the element. A copy holds the element's
 * children in the element's own shape, handed to `createElement` as one
 * argument, and in development takes the element's mark for React's key check,
 * so React asks for keys exactly where it would for the element itself. React
 * records the component rendering the node as each copy's owner, whichever
 * component built the element. Kept out of `render` so the render loop's code
 * shape stays that of a node without element children.
 * @param copyQueue Frames queued by {@link resolveCopyingChild}.
 * @param disableEmotion Whether the rendering node disabled Emotion, passed on to host render props.
 */
function drainCopies(copyQueue: CopyFrame[], disableEmotion: boolean | undefined): void {
  while (copyQueue.length > 0) {
    const frame = copyQueue[copyQueue.length - 1]
    const { element } = frame
    if (frame.box === undefined) {
      const layout = copyLayout(element)
      const children = NodeUtil.resolveHostRenderProp(element.type, layout, disableEmotion)
      frame.box = [children]
      // A host element's render prop became a final `functionRenderer`
      // element; only the element's own children are copied.
      if (children === layout) queueCopies(frame.box, copyQueue)
      continue
    }
    copyQueue.pop()
    const copyType = element.type as ElementType
    const children = frame.box[0]
    const props = copyType === Fragment || isFragment(copyType) ? { key: element.key ?? undefined } : copyProps(element)
    const copy: DevElement = children === undefined ? createElement(copyType, props) : createElement(copyType, props, children as ReactNode)
    const store = (element as DevElement)._store
    if (store !== undefined && copy._store !== undefined) copy._store.validated = store.validated
    ;(frame.into as unknown[])[frame.at] = copy
  }
}

/** A child node's rendered element, looked up from the begin phase. */
function renderedChild(child: BaseNode, rendered: Map<BaseNode, ReactElement>, location: unknown): ReactElement {
  const element = rendered.get(child)
  if (!element) {
    const where = typeof location === 'string' ? ` at ${location}` : ''
    throw new Error(
      `[MeoNode] A child node (${getElementTypeName(child.element)})${where} was not rendered, which should not be reachable — ` +
        `every node in \`children\`, including inside nested arrays, is collected before this point. ` +
        `This is a bug in MeoNode rather than in your code; please report it with the call site above.`,
    )
  }
  return element
}

function resolveChild(child: unknown, rendered: Map<BaseNode, ReactElement>, location: unknown): ReactNode {
  if (Array.isArray(child)) return child.map(c => resolveChild(c, rendered, location)) as unknown as ReactNode
  if (!NodeUtil.isNodeInstance(child)) return child as ReactNode
  return renderedChild(child, rendered, location)
}

/**
 * {@link resolveChild} for a node whose children hold element children: each
 * one is queued on `copies`, to be copied into the slot it is returned in.
 */
function resolveCopyingChild(child: unknown, rendered: Map<BaseNode, ReactElement>, location: unknown, copies: CopyFrame[]): ReactNode {
  if (Array.isArray(child)) {
    const list: unknown[] = new Array(child.length)
    for (let i = 0; i < child.length; i++) {
      const queued = copies.length
      list[i] = resolveCopyingChild(child[i], rendered, location, copies)
      if (copies.length > queued && copies[copies.length - 1].into === undefined) {
        copies[copies.length - 1].into = list
        copies[copies.length - 1].at = i
      }
    }
    return list as unknown as ReactNode
  }
  if (!NodeUtil.isNodeInstance(child)) {
    if (isValidElement(child) && !NodeUtil.isFinalizedElement(child)) copies.push({ element: child, box: undefined, into: undefined, at: 0 })
    return child as ReactNode
  }
  return renderedChild(child, rendered, location)
}

/**
 * The core abstraction of the MeoNode library. It wraps a React element or component,
 * providing a unified interface for processing props, normalizing children, and handling styles.
 * This class is central to the library's ability to offer a JSX-free, fluent API for building UIs.
 * It uses an iterative rendering approach to handle deeply nested structures without causing stack overflows.
 * @template E - The type of React element or component this node represents.
 */
export class BaseNode<E extends NodeElementType = NodeElementType> {
  private static _idCounter = 0
  public instanceId: string = `m${++BaseNode._idCounter}`

  public element: E
  public rawProps: Partial<NodeProps<E>> = {}
  public readonly isBaseNode = true

  private _props?: FinalNodeProps

  /**
   * Set when processing this node's props kept an element child for copying
   * where it renders. Declared without a value so a node that keeps none, nearly
   * every node, carries no such property.
   */
  declare private _copiesChildren?: true

  /**
   * The built element this node stands for: an element child that holds a node
   * of its own, so it takes the walk instead of a copy. The node renders back to
   * that element with its children in the element's own shape. Declared without
   * a value, like `_copiesChildren`.
   */
  declare private _builtFrom?: ReactElement
  private readonly _deps?: DependencyList

  // Render Context Pooling
  private static get renderContextPool() {
    return getGlobalState(RENDER_CONTEXT_POOL_KEY, () => [] as { workStack: WorkItem[]; renderedElements: Map<BaseNode, ReactElement> }[])
  }

  private static acquireRenderContext() {
    const pool = BaseNode.renderContextPool
    if (pool.length > 0) {
      return pool.pop()!
    }
    return {
      workStack: new Array(512),
      renderedElements: new Map<BaseNode, ReactElement>(),
    }
  }

  private static releaseRenderContext(ctx: { workStack: WorkItem[]; renderedElements: Map<BaseNode, ReactElement> }) {
    // Limit pool size to prevent memory hoarding
    if (BaseNode.renderContextPool.length < 50) {
      // Only recycle if the stack capacity is not excessively large (e.g., < 2048 items)
      // This prevents the pool from holding onto massive arrays from deep renders,
      // which could lead to memory fragmentation or high memory usage.
      if (ctx.workStack.length < 2048) {
        ctx.workStack.length = 0
        ctx.renderedElements.clear()
        BaseNode.renderContextPool.push(ctx)
      }
    }
  }

  constructor(element: E, rawProps: Partial<NodeProps<E>> = {}, deps?: DependencyList) {
    // Element type validation is performed once at construction to prevent invalid nodes from being created.
    if (!isValidElementType(element)) {
      const elementType = getComponentType(element)
      if (NodeUtil.isNodeInstance(element)) {
        throw new Error(`Invalid element type: MeoNode UI instance provided!`)
      }
      throw new Error(`Invalid element type: ${elementType} provided!`)
    }
    this.element = element
    this.rawProps = rawProps
    this._deps = deps
  }

  /**
   * A node standing for a built element child that holds a node, made from the
   * element's props as final props.
   * @param element The built element.
   * @param rawProps The node's props: the element's under `props`, its children and key.
   * @returns The node, which renders back to the element's shape.
   */
  public static fromElement(element: ReactElement, rawProps: Partial<NodeProps>): BaseNode {
    const node = new BaseNode(element.type as ElementType, rawProps as never, undefined)
    node._builtFrom = element
    return node
  }

  /**
   * In development, marks the elements authored nodes rendered to in a built
   * element's list as checked, as handing them to `createElement` one by one
   * would. A node is an authored child, which MeoNode keeps out of React's key
   * check; the built elements and copies beside them keep their own marks.
   * @param children The list as the node holds it.
   * @param rendered The same list with every node resolved to its element.
   */
  private static markAuthoredChildren(children: readonly unknown[], rendered: readonly unknown[]): void {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (Array.isArray(child)) BaseNode.markAuthoredChildren(child, rendered[i] as unknown[])
      else if (NodeUtil.isNodeInstance(child) && child._builtFrom === undefined) {
        const store = (rendered[i] as DevElement | undefined)?._store
        if (store !== undefined) store.validated = 1
      }
    }
  }

  /**
   * Lazily processes and retrieves the final, normalized props for the node.
   * The props are processed only once and then cached for subsequent accesses.
   * @getter props
   */
  public get props(): FinalNodeProps {
    if (!this._props) {
      const kept = NodeUtil.elementsKeptForCopy
      this._props = NodeUtil.processProps(this.rawProps, this._builtFrom !== undefined)
      if (NodeUtil.elementsKeptForCopy !== kept) this._copiesChildren = true
    }
    return this._props
  }

  /**
   * Returns the dependency list associated with this node.
   *
   * Mirrors React hook semantics, because it is one: the list is handed to
   * `useMemo` inside the `MeoMemo` fiber that holds this node's subtree.
   * `undefined` means the node is not memoized at all and is rebuilt with its
   * parent.
   *
   * Taken literally, which is a change from the element cache this replaced.
   * That cache keyed on a signature of the node's props, so a prop change
   * invalidated the entry whatever the dependency list said — `deps: []` meant
   * "rebuild whenever a prop changes" rather than "never rebuild". A node that
   * should follow a value now has to name it, exactly as `useMemo` requires.
   * @getter deps
   */
  public get dependencies(): DependencyList | undefined {
    return this._deps
  }

  /**
   * Renders the `BaseNode` and its entire subtree into a ReactElement, with
   * opt-in memoization via dependency arrays.
   *
   * This method uses an **iterative (non-recursive) approach** with a manual work stack.
   * This is a crucial architectural choice to prevent "Maximum call stack size exceeded" errors
   * when rendering very deeply nested component trees, a common limitation of naive recursive rendering.
   *
   * The process works in two phases for each node:
   * 1. **Begin Phase:** When a node is first visited, its children are pushed onto the stack. This ensures a bottom-up build.
   * 2. **Complete Phase:** After all of a node's descendants have been rendered, the loop returns to the node.
   *    It then collects the rendered children from a temporary map and creates its own React element.
   * @method render
   */

  /**
   * Renders this node and its subtree to a React element, walking the tree
   * iteratively. A node given `deps` is handed to React as a `MeoMemo` fiber
   * rather than walked here, so its subtree is rebuilt only when those `deps`
   * change.
   * @param memoized Internal. Set by `MeoMemo` when it calls back in, so a
   * memoized node builds its subtree instead of wrapping itself again.
   * @returns The rendered React element.
   */
  public render(memoized: boolean = false): ReactElement<FinalNodeProps> {
    // Fiber-backed memoization for a render root. `MeoMemo` calls back in with
    // `memoized` set, which is what stops this from recursing.
    if (!NodeUtil.isServer && this._deps && !memoized) {
      const rootKey = (this.rawProps as { key?: string | number }).key
      return createElement(MeoMemo, { key: rootKey, node: this, deps: this._deps }) as ReactElement<FinalNodeProps>
    }

    // Acquire context from pool to reduce allocation pressure
    const ctx = BaseNode.acquireRenderContext()
    let { workStack } = ctx
    const { renderedElements } = ctx
    let stackPointer = 0
    // Server-compiled rules this render emits, keyed by the element that carries
    // them in its children. `rootRules` holds the ones whose consumer has no host
    // able to carry them anywhere above it in this render.
    const anchoredRules = new Map<BaseNode, Map<string, ReactElement>>()
    const rootRules = new Map<string, ReactElement>()
    // `ThemedRule`s that render beside the element keyed here, inside one of
    // MeoNode's own providers, because no host in that provider can carry them.
    const besideRules = new Map<BaseNode, Map<string, ReactElement>>()
    // The modules each rules map's static css needs, once static css is
    // registered. A map holding any gets one `StaticStyles` slot, reserved ahead
    // of its other rules: in the server layer those are hoisted at a precedence
    // React must meet after the static ones.
    const staticModules = hasStaticCss() ? new Map<Map<string, ReactElement>, string[]>() : undefined
    const staticSlot = (rules: Map<string, ReactElement>): string[] => {
      let modules = staticModules!.get(rules)
      if (!modules) {
        modules = []
        staticModules!.set(rules, modules)
        // Holds the map position until the carrier completes.
        rules.set(STATIC_STYLES_KEY, null as unknown as ReactElement)
      }
      return modules
    }
    const finishStaticSlot = (rules: Map<string, ReactElement>): void => {
      const modules = staticModules?.get(rules)
      if (modules) rules.set(STATIC_STYLES_KEY, createElement(StaticStyles, { key: STATIC_STYLES_KEY, modules }))
    }

    try {
      // Fast capacity check with exponential growth
      const ensureCapacity = (required: number) => {
        if (required > workStack.length) {
          // Double capacity or use exact requirement (whichever is larger)
          const newCapacity = Math.max(required, workStack.length << 1)
          const newStack = new Array(newCapacity)

          // Manual copy is faster than Array methods for primitive/object arrays
          for (let i = 0; i < stackPointer; i++) {
            newStack[i] = workStack[i]
          }

          workStack = newStack
        }
      }

      // Push initial work item
      workStack[stackPointer++] = {
        node: this,
        isProcessed: false,
        theme: undefined,
        anchor: null,
        inForeignNamespace: false,
        themeAnchor: null,
        besidePassThrough: false,
      }

      // Iterative depth-first traversal with explicit begin/complete phases to avoid recursion.
      while (stackPointer > 0) {
        const currentWork = workStack[stackPointer - 1]
        if (!currentWork) {
          stackPointer--
          continue
        }
        const { node, isProcessed, theme: inheritedTheme, anchor, inForeignNamespace, themeAnchor, besidePassThrough } = currentWork

        const getActiveTheme = (props: FinalNodeProps, current?: Theme): Theme | undefined => {
          const candidate = (props as { theme?: unknown }).theme
          if (candidate && typeof candidate === 'object' && 'system' in (candidate as object)) {
            return candidate as Theme
          }
          return current
        }

        if (!isProcessed) {
          // Begin phase: mark processed and push child BaseNodes onto the stack (in reverse order)
          currentWork.isProcessed = true
          const children = node.props.children
          const activeTheme = getActiveTheme(node.props, inheritedTheme)
          // The topmost host above each child that can carry its rules, and
          // whether the child sits in SVG or MathML, where none can. Only the
          // server layer compiles rules, and only static css is carried
          // elsewhere, so without either no child gets an anchor.
          const beginAs = (node.props as { as?: NodeElementType }).as
          const beginTarget = beginAs != null && isValidElementType(beginAs) ? beginAs : node.element
          const childAnchor =
            IS_REACT_SERVER_LAYER || staticModules !== undefined
              ? (anchor ?? (canAnchorRules(beginTarget, node.props as Record<string, unknown>, inForeignNamespace) ? node : null))
              : null
          const childInForeignNamespace = inForeignNamespace || beginTarget === 'svg' || beginTarget === 'math'
          // The same, for a `ThemedRule`, which resolves against the theme where it
          // renders: the topmost host since the last component above, which may
          // supply another theme.
          const childThemeAnchor =
            !IS_REACT_SERVER_LAYER || mayChangeTheme(beginTarget)
              ? null
              : (themeAnchor ?? (canAnchorRules(beginTarget, node.props as Record<string, unknown>, inForeignNamespace) ? node : null))

          if (children) {
            // Only consider BaseNode children for further traversal; primitives and React elements are terminal.
            const childArray = Array.isArray(children) ? children : [children]

            // A `children` array may hold arrays. Their members render like any
            // other child, so they are collected here — a nested array skipped at
            // this phase would never reach `renderedElements`, and the complete
            // phase below would then fail to look it up rather than rendering it.
            const pending = collectNodeChildren(childArray)

            ensureCapacity(stackPointer + pending.length)

            for (let i = pending.length - 1; i >= 0; i--) {
              const child = pending[i]
              if (!NodeUtil.isNodeInstance(child)) continue

              // Fiber-backed memoization: hand the subtree to React instead of
              // deriving a key for it. The child becomes terminal for this walk
              // — `MeoMemo` re-enters through `child.render()` when its `deps`
              // say to — so it needs no cache entry, cannot collide with
              // another subtree, and is released when its fiber unmounts.
              if (!NodeUtil.isServer && child.dependencies) {
                const childKey = (child.rawProps as { key?: string | number }).key
                renderedElements.set(child, createElement(MeoMemo, { key: childKey, node: child, deps: child.dependencies }))
                continue
              }

              workStack[stackPointer++] = {
                node: child,
                isProcessed: false,
                theme: activeTheme,
                anchor: childAnchor,
                inForeignNamespace: childInForeignNamespace,
                themeAnchor: childThemeAnchor,
                // A direct child of one of MeoNode's own providers, which render
                // their children as given, so a rule may go beside it. Not inside
                // SVG or MathML, where a `<style>` would be that namespace's element.
                besidePassThrough: IS_REACT_SERVER_LAYER && !childInForeignNamespace && passesChildrenThrough(beginTarget),
              }
            }
          }
        } else {
          // Complete phase
          stackPointer--

          // Extract node props. Non-present props default to undefined via destructuring.
          // `as` is the Emotion-style polymorphic target: it is consumed here (never
          // forwarded to the DOM) and only used to swap the rendered element below.
          const {
            children: childrenInProps,
            key,
            css,
            nativeProps,
            disableEmotion,
            as: asTarget,
            [LIST_MARKER]: generatedChildren,
            [LOCATION_MARKER]: callSiteLocation,
            [STATIC_CLASSES_MARKER]: staticClasses,
            [STATIC_VARS_MARKER]: staticVars,
            ...otherProps
          } = node.props

          const activeTheme = getActiveTheme(node.props, inheritedTheme)
          const builtFrom = node._builtFrom

          // Resolve the element to actually render. `as` swaps the render target
          // ("render this other tag/component, keep the styles") while reusing the
          // exact same Emotion compilation path, so SSR/CSR hashing is unchanged.
          // Falls back to the base element when `as` is absent or not a valid type.
          // `node.element` is the broad `NodeElementType` (includes node-function forms);
          // `createElement` wants `ElementType`, so the base assignment narrows it once.
          // The `as` swap itself is cast-free: `isValidElementType` narrows `asTarget`.
          let renderTarget = node.element as ElementType
          if (asTarget != null && isValidElementType(asTarget)) {
            renderTarget = asTarget
          }
          // A node in a prop is a supported pattern — a component can take one and
          // put it in its own `children`, where the walk resolves it (see
          // `tests/props-attributes.test.ts`). So this cannot be a general check.
          //
          // A plain HTML tag is the one case with no receiver to do that: the prop
          // becomes an attribute and the node stringifies to `[object Object]`,
          // silently. That is decidable here, because `renderTarget` is a string,
          // and it is the only shape where passing a node is unambiguously wrong.
          if (typeof renderTarget === 'string') {
            assertNoNodeInHostProps(otherProps as Record<string, unknown>, callSiteLocation)
          }

          let finalChildren: ReactNode[] = []

          const hostChildren = NodeUtil.resolveHostRenderProp(renderTarget, childrenInProps, disableEmotion) as typeof childrenInProps
          if (!NodeUtil.isNoChild(hostChildren)) {
            // Convert child placeholders into concrete React nodes:
            // - If it's a BaseNode, lookup its rendered ReactElement from the map.
            // - If it's already a React element, use it directly (with enhanced key).
            // - Otherwise treat as primitive ReactNode.
            const childArray = Array.isArray(hostChildren) ? hostChildren : [hostChildren]
            const childCount = childArray.length
            // Pre-allocate array to avoid resizing during iteration
            finalChildren = new Array(childCount)

            // A node's own children, unlike a render prop's resolved element, may
            // hold element children, which are copied below. A node whose
            // children hold none resolves them with `resolveChild` alone.
            const copyQueue: CopyFrame[] | undefined = node._copiesChildren === true && hostChildren === childrenInProps ? [] : undefined
            if (copyQueue === undefined) {
              for (let i = 0; i < childCount; i++) {
                finalChildren[i] = resolveChild(childArray[i], renderedElements, callSiteLocation)
              }
            } else {
              for (let i = 0; i < childCount; i++) {
                finalChildren[i] = resolveCopyingChild(childArray[i], renderedElements, callSiteLocation, copyQueue)
                if (copyQueue.length > 0 && copyQueue[copyQueue.length - 1].into === undefined) {
                  copyQueue[copyQueue.length - 1].into = finalChildren
                  copyQueue[copyQueue.length - 1].at = i
                }
              }
            }

            // Each element child becomes a fresh copy, as the walk would build it
            // from a node wrapping the element, and so does every element below it.
            if (copyQueue !== undefined && copyQueue.length > 0) drainCopies(copyQueue, disableEmotion)

            // A built element's list is key-checked by React as the element's own
            // would be, so in development the elements its authored nodes rendered
            // to are marked as handing them over one by one would have marked them.
            if (builtFrom !== undefined && (builtFrom as DevElement)._store !== undefined && Array.isArray(hostChildren)) {
              BaseNode.markAuthoredChildren(hostChildren, finalChildren)
            }
          }

          // How the children reach `createElement` is what decides whether React
          // asks for keys. Passing them as separate arguments is React's signal
          // that a human wrote the siblings out, so it marks them validated and
          // never warns; passing one array is the signal that they came from a
          // list, so it checks. Both reconcile identically — the choice only
          // changes the diagnostic — which is why it can follow the compiler's
          // marker rather than anything about the values.
          //
          // Three separate conditions, each load-bearing for its own reason.
          // Stated together because removing any one of them looks harmless
          // from the other two, and two of them have already been lost that way.
          //
          // `generatedChildren` — only the compiler can know a list was
          // generated, so an authored call site keeps spreading and stays as
          // quiet as React makes it. Nothing here infers list-ness from a value.
          //
          // `Array.isArray(childrenInProps)` — whether the expression produced a
          // list at all, which is not the same question. `children: row`, a
          // variable holding one node, must be called generated by a compiler
          // that cannot see inside the identifier; the value settles it here.
          // Note this is NOT a row count: `_processChildren` deliberately keeps a
          // marked call site's one-element array, so a `.map()` returning one row
          // is still a list and is still reported, exactly as React reports an
          // unkeyed one-element array and stays silent for a bare child. That
          // coupling is load-bearing and is newer than this condition: restoring
          // the collapse for marked call sites would reopen the one-row hole
          // here, silently, with nothing in this line to suggest why.
          //
          // `finalChildren.length > 0` — whether there is anything to pass. An
          // empty generated list must keep spreading: `...[]` passes no argument
          // and leaves `props.children` undefined, while `[[]]` passes one empty
          // array and makes it `[]`. That difference is invisible on a host
          // element and decisive everywhere else — `children ?? <Empty/>` stops
          // firing and `{children && ...}` starts rendering an empty wrapper,
          // both precisely when a component wanted its empty state — and on a
          // void element React rejects the child argument outright and throws.
          const childArguments = generatedChildren && Array.isArray(childrenInProps) && finalChildren.length > 0 ? [finalChildren] : finalChildren
          // A built element's children reach React in the element's own shape: a
          // list as one argument, which React key-checks as it would the element's.
          const elementChildren = builtFrom !== undefined && Array.isArray(childrenInProps) ? [finalChildren] : childArguments

          // React's report says a key is missing; it cannot say where. Every
          // element in the tree is created inside this one `.render()` call, so
          // React attributes them all to it. `__meo$loc` is the compiler's
          // record of where the list was actually written, and this prints it
          // beside React's message rather than instead of it — no React text is
          // reproduced here.
          //
          // Only when something is actually missing a key: a fully keyed list
          // needs no location, and a line per rendered list would bury the
          // reports it is meant to help find. This also covers the case where
          // React says nothing at all — a marked list whose children reach a
          // host element through an unmarked node is spread variadically there,
          // which silences React, leaving this as the only signal.
          // Gated like every other MeoNode diagnostic rather than behind
          // `setDebugMode`, so it reaches an ordinary `next dev` run. The person
          // this exists for has hit a key warning that names no call site and does
          // not know the feature exists; behind the strict flag it only ever
          // reached people who already knew to look for it.
          //
          // Condition order is deliberate and a tidy-up would undo it.
          // `diagnosticsEnabled()` is a function call, so it goes last, behind two
          // property comparisons.
          // `callSiteLocation` is undefined unless the plugin ran with
          // `callSiteLocations` — nearly every build — so almost everyone
          // short-circuits on the first term and never reaches the call.
          if (childArguments !== finalChildren && diagnosticsEnabled()) {
            const elements = finalChildren.filter(isValidElement)
            const missingKey = elements.some(child => child.key == null)
            // A list where *some* children carry keys and others do not is
            // almost always a generated list spread in beside children the
            // author wrote out: the `.map()` supplied keys, the heading beside
            // it did not, and React then names the heading. The reader audits
            // the rows, which are the innocent half.
            const mixed = missingKey && elements.some(child => child.key != null)
            // The shape clause needs only the list marker, which every compiled
            // build emits. The call site needs the plugin's `callSiteLocations`
            // option, which most builds do not set — so withholding the
            // explanation until the line number is available would keep the
            // useful half from nearly everyone, to avoid omitting the
            // ornamental one.
            //
            // Without a location, only the mixed case is worth saying. React
            // already reports an all-unkeyed list correctly; repeating it with
            // no line number adds noise and nothing else.
            if (missingKey && (callSiteLocation || mixed)) {
              const spreadClause = mixed
                ? ' Some children here do have keys: a spread puts a generated list and the siblings written beside it into one list, so React asks those siblings for keys too. Nest the generated part instead of spreading it.'
                : ''
              console.warn(
                callSiteLocation
                  ? `[MeoNode] A generated list at ${callSiteLocation} has children without a \`key\`. React reports the missing key itself; this names the call site it came from.${spreadClause}`
                  : `[MeoNode] A generated list has children without a \`key\`.${spreadClause} Turn on \`callSiteLocations\` in the @meonode/compiler plugin options to have this name the file and line.`,
              )
            }
          }

          // Merge element props: explicit other props + DOM native props + React key.
          // Then convert any string `theme.*` tokens carried by props (e.g. MUI
          // `sx`, `style`, third-party CSS-bearing props) to
          // `var(--meonode-theme-*)` references. Applied on both server and
          // client so the DOM is identical post-hydration: client-side paths
          // that don't go through StyledRenderer (e.g. components with `sx`
          // but no `css`) would otherwise leak `theme.*` literals into the
          // live DOM. The util preserves reference identity for untouched
          // subtrees and skips non-plain objects (refs, class instances), so
          // this is safe to apply unconditionally.
          // `nativeProps` (the `props` escape hatch) is normally spread onto the
          // element, which is right for a DOM target — they are attributes. A
          // target that re-runs `Node()` over what it receives, such as the
          // `Component` HOC, would instead classify them a second time and turn
          // a CSS-named component prop into a style. Those keep the wrapper.
          const shieldNativeProps = nativeProps !== undefined && NodeUtil.shieldsOwnProps(renderTarget)
          // A built element's props are its own and final; `builtElementProps`
          // converts only their style values.
          const elementProps =
            builtFrom !== undefined
              ? (builtElementProps(renderTarget, key, { ...otherProps, ...nativeProps }) as ComponentProps<ElementType>)
              : replaceThemeTokensWithCssVars({
                  ...(otherProps as ComponentProps<ElementType>),
                  key,
                  ...(shieldNativeProps ? { props: nativeProps } : nativeProps),
                })

          // `theme` is deliberately not destructured off props: components such
          // as ThemeProvider take it as a real prop and dropping it was a
          // regression once already. An intrinsic element has no such use for
          // it, and forwarding it stringifies the object into the DOM as
          // `theme="[object Object]"`, so it is removed only for string tags.
          if (typeof renderTarget === 'string' && 'theme' in elementProps) {
            delete (elementProps as Record<string, unknown>).theme
          }

          // Styles the compiler extracted reach the element as classes and
          // variables on every path below. Their rules are carried by the topmost
          // host above, for the server to send; see `StaticStyles`. A node with
          // Emotion disabled, its own or an ancestor's, takes none of them, as it
          // takes none of its css: an ancestor's reaches it here, after the build.
          if (!disableEmotion && (staticClasses !== undefined || staticVars !== undefined)) {
            addStaticProps(elementProps as Record<string, unknown>, staticClasses as string | undefined, staticVars as Record<string, unknown> | undefined)
            if (staticClasses !== undefined && staticModules !== undefined) {
              const carrier = anchor ?? (canAnchorRules(renderTarget, elementProps as Record<string, unknown>, inForeignNamespace) ? node : null)
              let rules = carrier ? anchoredRules.get(carrier) : rootRules
              if (!rules) {
                rules = new Map<string, ReactElement>()
                anchoredRules.set(carrier as BaseNode, rules)
              }
              const modules = staticSlot(rules)
              if (NodeUtil.isServer) for (const moduleId of modulesOfClasses(staticClasses as string)) if (!modules.includes(moduleId)) modules.push(moduleId)
            }
          }

          let element: ReactElement<FinalNodeProps>

          // Handle fragments specially: create fragment element with key and children.
          if (node.element === Fragment || isFragment(node.element)) {
            element = createElement(node.element as ExoticComponent<FragmentProps>, { key }, ...elementChildren)
          } else {
            // StyledRenderer for emotion-based styling unless explicitly disabled or no styles are present.
            // StyledRenderer handles SSR hydration and emotion CSS injection when css prop exists or element has style tags.
            // All element-shape decisions use `renderTarget` so an `as` swap is honored consistently.
            const isStyledComponent = !disableEmotion && (css || !hasNoStyleTag(renderTarget)) && Object.keys(css || {}).length > 0
            // In the RSC layer an element's output is final: it never renders on
            // the client, and a server function cannot be handed to the
            // `StyledRenderer` client component at all. Its css is compiled to a
            // class name here instead, which also keeps the css object out of the
            // flight payload. Everywhere else — a client component's server
            // render, or a server render outside Next — the client renders the
            // same tree through `StyledRenderer` when it hydrates, so the server
            // takes that path too: Emotion then composes a class the element is
            // handed with its own css in one cache, the way the client does.
            // The layer constant comes first in these conditions, so the default build, where
            // it is `false`, folds the server-layer path out.
            const shouldBypassStyledRendererOnServer = IS_REACT_SERVER_LAYER && NodeUtil.isServer
            // Keep server/client on the same StyledRenderer path for client references.
            // This avoids Emotion hash drift not only for theme tokens, but also for raw
            // CSS values (e.g. "red", "#ff0000") that would otherwise use different
            // server vs client compilation routes.
            const shouldUseRuntimeThemeOnServer = shouldBypassStyledRendererOnServer && isStyledComponent && NodeUtil.isClientReference(renderTarget)

            if ((isStyledComponent && !shouldBypassStyledRendererOnServer) || shouldUseRuntimeThemeOnServer) {
              // `elementProps` was already pre-processed above, so only `css`
              // needs the var conversion here on the server. Aligning with the
              // client runtime's vars-mode resolution keeps the Emotion class
              // hash identical across SSR/CSR.
              const cssForRenderer = NodeUtil.isServer ? replaceThemeTokensWithCssVars(css) : css
              element = createElement(StyledRenderer, { element: renderTarget, ...elementProps, css: cssForRenderer }, ...elementChildren)
            } else if (shouldBypassStyledRendererOnServer && isStyledComponent && !NodeUtil.acceptsServerCss(renderTarget)) {
              // Emit `var(--meonode-theme-*)` on the server so the generated Emotion class
              // matches the client runtime output — unifies the class hash across SSR/CSR.
              // `replaceThemeTokensWithCssVars` runs even when activeTheme is undefined
              // (e.g., RSC/SSR bundler-layer split where the layout-set global state does not
              // carry into the client page's SSR pass), so string tokens still produce vars.
              // `processFunctions: true` executes any callable theme refs in `css`,
              // and with no theme in scope drops them, so none reaches `ThemedRule`:
              // a function cannot be handed to a client component. What one returns
              // is converted to vars too, as the client converts it.
              const themedCss = ThemeUtil.resolveObjWithTheme(replaceThemeTokensWithCssVars(css), activeTheme, {
                processFunctions: true,
                themeStringsMode: 'vars',
              })
              // Development only; no-ops in production. With a theme in scope this
              // is the check `StyledRenderer` makes. With none, the token
              // references are left to `ThemeTokenCheck` below, which runs where
              // the ThemeProvider is.
              reportThemeIssues(themedCss, activeTheme ? getThemeVarIndex(activeTheme) : undefined)
              const cssWithDefaults = ThemeUtil.resolveDefaultStyle(themedCss)
              // A key holding a theme token needs the theme's concrete value. With
              // a theme in scope it has been resolved above, and one still holding
              // a token names a value the theme lacks, so it is left out. With none,
              // the part from the first such key on goes to `ThemedRule`, which
              // resolves it where the theme is; the rest compiles here, under a
              // class named after the whole css.
              const { plain, themed } = activeTheme
                ? { plain: ThemeUtil.dropThemedKeys(cssWithDefaults, reportUnresolvedThemeKey), themed: undefined }
                : ThemeUtil.splitThemedCss(ThemeUtil.dropReservedStylesKeys(cssWithDefaults))
              const rule = compileServerEmotionRule(plain, elementProps.className, {
                share: typeof renderTarget !== 'string',
                identity: themed ? cssWithDefaults : undefined,
              })
              const elementPropsWithClassName = rule ? { ...elementProps, className: rule.className } : elementProps
              element = createElement(renderTarget, elementPropsWithClassName, ...elementChildren)
              if (rule && (rule.cssText || themed || rule.clientCss)) {
                const canCarry = canAnchorRules(renderTarget, elementProps as Record<string, unknown>, inForeignNamespace)
                const carrier = anchor ?? (canCarry ? node : null)
                const rules = carrier ? (anchoredRules.get(carrier) ?? new Map<string, ReactElement>()) : rootRules
                if (carrier) anchoredRules.set(carrier, rules)
                if (rule.cssText) {
                  if (staticModules !== undefined) staticSlot(rules)
                  rules.set(rule.id, ruleElement(rule))
                }
                // A server rule is hoisted by React wherever it renders, but
                // `ThemedRule` and `ThemeTokenCheck` read the theme where they
                // render, so they go to a host below the components above the
                // element: one of them may be a nested ThemeProvider. With no
                // component above, that is the carrier the server rule has. With
                // no such host, they go beside an element that is the direct child
                // of one of MeoNode's own providers, and with the server rule
                // otherwise: beside any other component's child, they would hand
                // that component a fragment in place of the child it was given.
                const themeCarrier = themeAnchor ?? (canCarry ? node : null)
                const carryWithTheme = (ruleKey: string, carried: ReactElement) => {
                  const themedRules = themeCarrier
                    ? (anchoredRules.get(themeCarrier) ?? new Map<string, ReactElement>())
                    : besidePassThrough
                      ? (besideRules.get(node) ?? new Map<string, ReactElement>())
                      : rules
                  if (themeCarrier) anchoredRules.set(themeCarrier, themedRules)
                  else if (besidePassThrough) besideRules.set(node, themedRules)
                  themedRules.set(ruleKey, carried)
                }
                const clientCss = rule.clientCss ?? themed
                if (clientCss) {
                  const ruleKey = `${rule.id}:themed`
                  carryWithTheme(ruleKey, createElement(ThemedRule, { key: ruleKey, className: rule.ownClassName, css: clientCss }))
                }
                // The tokens compiled here are checked where the providers are.
                // `ThemedRule` checks its own part. Only while diagnostics are on,
                // so production output carries nothing for it.
                if (!activeTheme && diagnosticsEnabled()) {
                  const refs = collectThemeVarRefs(plain)
                  if (refs.length > 0) {
                    const ruleKey = `${rule.id}:check`
                    carryWithTheme(ruleKey, createElement(ThemeTokenCheck, { key: ruleKey, refs }))
                  }
                }
              }
            } else {
              // On server function components, keep css support for true server components.
              // For client references (e.g. next/link), do not forward css to avoid leaking
              // unknown attributes like css="[object Object]" into HTML.
              const shouldForwardCssDirectly = isStyledComponent && (!shouldBypassStyledRendererOnServer || NodeUtil.acceptsServerCss(renderTarget))
              const elementPropsWithCss = shouldForwardCssDirectly ? { ...elementProps, css } : elementProps
              element = createElement(renderTarget, elementPropsWithCss, ...elementChildren)
            }
          }

          // A host carrying rules gets them as one trailing keyed slot, after its
          // own children, so none of those shift and the element stays the one
          // element it would be without them.
          const carriedRules = anchoredRules.get(node)
          if (carriedRules) {
            finishStaticSlot(carriedRules)
            element = cloneElement(element, undefined, ...elementChildren, [...carriedRules.values()])
          }
          const rulesBeside = besideRules.get(node)
          if (rulesBeside) element = createElement(Fragment, { key: element.key }, element, [...rulesBeside.values()])

          // In development, the element React receives keeps the built element's
          // mark for React's key check.
          if (builtFrom !== undefined) {
            const store = (builtFrom as DevElement)._store
            const rendered = (element as DevElement)._store
            if (store !== undefined && rendered !== undefined) rendered.validated = store.validated
          }

          // Store the rendered element so parent nodes can reference it.
          renderedElements.set(node, element)
        }
      }

      // Get the final rendered element for the root node of this render cycle.
      const rootElement = renderedElements.get(this) as ReactElement<FinalNodeProps>
      if (rootRules.size === 0) return rootElement
      finishStaticSlot(rootRules)

      // Rules whose consumer has no host above it in this render that could carry
      // them — a void, SVG or component element at the root, or under components
      // only — travel beside the root. This is the one case where the root is not
      // the element it would be without them.
      return createElement(Fragment, { key: rootElement.key }, rootElement, [...rootRules.values()]) as ReactElement<FinalNodeProps>
    } finally {
      // Always release context back to pool, even if an exception occurred
      // Null out workStack slots to help GC before releasing
      for (let i = 0; i < stackPointer; i++) {
        workStack[i] = null as any
      }
      BaseNode.releaseRenderContext({ workStack, renderedElements })
    }
  }

  // --- Utilities ---

  // A node is also a React lazy value, and its own payload. React resolves a lazy
  // value wherever it renders a node, in the client reconciler, Fizz and Flight,
  // by calling `_init(_payload)`. So a node handed to any prop a component renders
  // as a React node (a Suspense `fallback`, a slot) renders as the element its
  // `render()` returns, while the component itself still receives the node.
  // Declared in the class body so the prototype keeps its shape.

  protected get $$typeof(): symbol {
    return REACT_LAZY_TYPE
  }

  protected get _payload(): this {
    return this
  }

  /**
   * In development, `createElement` and `jsx` exempt a positional child from the
   * key check, and for a lazy child they do it through `_payload.value` when
   * `_payload.status` is `'fulfilled'`. React then resolves the lazy, more than
   * once per reconcile, and checks the element `_init` returns. `value` renders
   * the node and holds the element for the rest of the current task, and `_init`
   * returns it while it is held, so the exemption lands on the element React
   * checks. A concurrent render that yields between creating the parent element
   * and reconciling its children outlives the hold, and React then reports a
   * missing key for that node once.
   */
  protected get status(): 'fulfilled' {
    return 'fulfilled'
  }

  protected get value(): ReactElement {
    let element = heldForKeyCheck.get(this)
    if (!element) {
      element = this.render()
      heldForKeyCheck.set(this, element)
      heldCount++
      queueMicrotask(() => {
        heldForKeyCheck.delete(this)
        heldCount--
      })
    }
    return element
  }

  protected _init(node: BaseNode): ReactElement {
    return (heldCount > 0 && heldForKeyCheck.get(node)) || node.render()
  }
}

/**
 * Elements a node rendered for React's development key check, held until the end
 * of the current task so `_init` hands React the element that check exempted.
 * Empty in production, where React reads no `value`; `heldCount` keeps `_init`
 * from consulting it then.
 */
const heldForKeyCheck = new WeakMap<BaseNode, ReactElement>()
let heldCount = 0

// --- Factory Functions ---

/**
 * The primary factory function for creating a `BaseNode` instance.
 * It's the simplest way to wrap a component or element.
 * @function Node
 */
function Node<AdditionalProps, E extends NodeElementType, ExactProps extends object = object, As extends NodeElementType = E>(
  element: E,
  props: PolymorphicProps<E, As, AdditionalProps, ExactProps> = {} as any,
  deps?: DependencyList,
): NodeInstance<NoInfer<As>> {
  const node = buildNode(element, props, deps, Node)
  return node as unknown as NodeInstance<NoInfer<As>>
}

/**
 * Builds the node for a factory call.
 *
 * Every factory comes through here, the calls MeoNode's own components make
 * (ThemeProvider and the other providers) included, so the development list
 * report sees each call the author wrote. The nodes MeoNode rebuilds from what
 * it renders (`NodeUtil`) are constructed directly and are not observed. A list
 * one of its components builds around children it was handed is recognised by
 * those children, as for any component that re-wraps its `children`.
 *
 * Its callers keep the result in a variable rather than returning the call:
 * Safari implements proper tail calls, which drop a tail caller's frame, and
 * the call site's stack is cut at the caller's frame.
 * @param factory The function the author called, where the call site's stack begins.
 */
function buildNode(element: NodeElementType, props: object, deps: DependencyList | undefined, factory: (...args: never[]) => unknown): BaseNode {
  if (diagnosticsEnabled()) observeChildren(element, props as Record<string, unknown>, factory)
  if (isDevMode()) NodeUtil.markWrittenOutChildren(props as Record<string, unknown>)
  return new BaseNode(element, props as NodeProps, deps)
}

// Export the Node factory as the main export
export { Node }

/**
 * Merges two `css` maps the way flat CSS props already combine: key by key,
 * recursing into nested selectors and at-rules, with `over` winning a conflict.
 *
 * An explicit `undefined` in `over` wins too, as it does for a flat prop. That is
 * how a call site opts out of a single factory rule without losing the rest.
 *
 * Copy-on-write. `base` is the factory's `css`, one object shared by every call
 * to that factory, so writing into it would leak one call site's rules into
 * every later render. Nested objects that `over` does not touch are shared by
 * reference, which is what the factory's `css` already was before this merge.
 */
function mergeCss(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }
  for (const key of Object.keys(over)) {
    const next = over[key]
    const prev = merged[key]
    merged[key] = isMergeableCss(prev) && isMergeableCss(next) ? mergeCss(prev, next) : next
  }
  return merged
}

/** Whether a `css` value can contribute rules: anything but nullish or a boolean. */
function stylesSomething(css: unknown): boolean {
  return css != null && typeof css !== 'boolean'
}

/**
 * Combines a factory's initial props with a call site's.
 *
 * A shallow spread for everything but `css`. Flat CSS props are top-level keys,
 * so the spread already combines them one by one; `css` is a single key holding
 * a whole map of rules, which a spread would replace outright, dropping every
 * pseudo-class, media query and `@supports` fallback the factory defined.
 *
 * Two mergeable maps are merged key by key. When either side is something else —
 * an Emotion `css()` result, an array, a function, a string — the two are
 * composed as `[factoryCss, callSiteCss]`, which Emotion serialises in order, so
 * the call site still wins a conflict and the factory's rules are kept. A side
 * that is absent or a boolean styles nothing, and the call site's value is used
 * as it is.
 *
 * The shape of `props` does not matter here. A user-defined factory is not
 * rewritten by `@meonode/compiler`, so its call sites arrive flat; a call to a
 * factory the compiler does rewrite arrives with its flat CSS props moved into
 * `__meo$c`, but `css` is one of the keys the compiler always leaves top-level,
 * as a plain object whose `theme.*` tokens may already have been replaced.
 */
function combineFactoryProps(initialProps: Record<string, unknown> | undefined, props: Record<string, unknown> | undefined): Record<string, unknown> {
  const combined: Record<string, unknown> = { ...initialProps, ...props }
  const factoryCss = initialProps?.css
  const callSiteCss = props?.css
  // Checked before they are combined, so an error names the `css` it was written in.
  checkFactoryCss(factoryCss)
  checkCss(callSiteCss)
  if (isMergeableCss(factoryCss) && isMergeableCss(callSiteCss)) {
    combined.css = mergeCss(factoryCss, callSiteCss)
  } else if (stylesSomething(factoryCss) && stylesSomething(callSiteCss)) {
    combined.css = [factoryCss, callSiteCss]
  }
  // Made only of what was just checked, so the node does not walk it again.
  markCombinedCssChecked(combined.css)
  return combined
}

/**
 * A factory's initial props as the compiler writes them in `__meo$i`: each entry
 * as `key:value;`, keys in UTF-16 code-unit order, a number as JavaScript writes
 * it. Only flat entries with string or number values have one, and none whose key
 * or value holds `;` or `:`, which would make the text ambiguous.
 * @returns The fingerprint, or `undefined` when the props have none.
 */
export function initialPropsFingerprint(initialProps: Record<string, unknown> | undefined): string | undefined {
  if (initialProps === undefined) return undefined
  let fingerprint = ''
  for (const key of Object.keys(initialProps).sort()) {
    const value = initialProps[key]
    if (typeof value !== 'string' && typeof value !== 'number') return undefined
    const text = String(value)
    if (/[;:]/.test(key) || /[;:]/.test(text)) return undefined
    fingerprint += `${key}:${text};`
  }
  return fingerprint
}

/** Each factory's fingerprint, worked out at its first marked call. */
const fingerprints = new WeakMap<object, string | undefined>()

/**
 * A call site's props with its factory's initial props merged in, unless the
 * compiler merged them itself: a call site marked with the factory's own
 * fingerprint already holds every initial entry, the call site's winning, so its
 * props are used as given and the initial ones do not come back as runtime css.
 * Any other call merges as before. A marker naming other initial props means the
 * compiler saw another version of the factory, and merging again only re-adds
 * what it merged.
 */
function factoryProps(initialProps: Record<string, unknown> | undefined, props: Record<string, unknown> | undefined): Record<string, unknown> {
  const marker = props?.[INITIAL_PROPS_MARKER]
  if (typeof marker === 'string' && initialProps !== undefined) {
    let own = fingerprints.get(initialProps)
    if (!fingerprints.has(initialProps)) {
      own = initialPropsFingerprint(initialProps)
      fingerprints.set(initialProps, own)
    }
    if (own !== undefined && marker === own) return props as Record<string, unknown>
  }
  return combineFactoryProps(initialProps, props)
}

/**
 * Creates a curried node factory for a given React element or component type.
 * This is useful for creating reusable, specialized factory functions (e.g., `const Div = createNode('div')`).
 * @function createNode
 */
export function createNode<AdditionalInitialProps, E extends NodeElementType, ExactInitialProps extends object = object>(
  element: E,
  initialProps?: MergedProps<E, AdditionalInitialProps, ExactInitialProps>,
): HasRequiredProps<PropsOf<E>> extends true
  ? (<AdditionalProps, ExactProps extends object = object, As extends NodeElementType = E>(
      props: PolymorphicProps<E, As, AdditionalProps, ExactProps>,
      deps?: DependencyList,
    ) => NodeInstance<NoInfer<As>>) & {
      element: E
    }
  : (<AdditionalProps, ExactProps extends object = object, As extends NodeElementType = E>(
      props?: PolymorphicProps<E, As, AdditionalProps, ExactProps>,
      deps?: DependencyList,
    ) => NodeInstance<NoInfer<As>>) & {
      element: E
    } {
  const Instance = <AdditionalProps, ExactProps extends object = object>(
    props?: MergedProps<E, AdditionalProps, ExactProps>,
    deps?: DependencyList,
  ): BaseNode => {
    const node = buildNode(
      element,
      factoryProps(initialProps as Record<string, unknown> | undefined, props as Record<string, unknown> | undefined),
      deps,
      Instance,
    )
    return node
  }
  Instance.element = element
  return Instance as any
}

/**
 * Creates a node factory function where the first argument is `children` and the second is `props`.
 * This provides a more ergonomic API for components that primarily wrap content (e.g., `P('Some text')`).
 * @function createChildrenFirstNode
 */
export function createChildrenFirstNode<AdditionalInitialProps, E extends NodeElementType, ExactInitialProps extends object = object>(
  element: E,
  initialProps?: MergedProps<E, AdditionalInitialProps, ExactInitialProps>,
): HasRequiredProps<PropsOf<E>> extends true
  ? (<AdditionalProps = undefined, ExactProps extends object = object, As extends NodeElementType = E>(
      children: Children,
      props: PolymorphicProps<E, As, AdditionalProps, ExactProps> & { children?: never },
      deps?: DependencyList,
    ) => NodeInstance<NoInfer<As>>) & { element: E }
  : (<AdditionalProps = undefined, ExactProps extends object = object, As extends NodeElementType = E>(
      children?: Children,
      props?: PolymorphicProps<E, As, AdditionalProps, ExactProps> & { children?: never },
      deps?: DependencyList,
    ) => NodeInstance<NoInfer<As>>) & {
      element: E
    } {
  const Instance = <AdditionalProps = undefined, ExactProps extends object = object>(
    children?: Children,
    props?: MergedProps<E, AdditionalProps, ExactProps> & { children?: never },
    deps?: DependencyList,
  ): BaseNode => {
    const node = buildNode(
      element,
      { ...factoryProps(initialProps as Record<string, unknown> | undefined, props as Record<string, unknown> | undefined), children },
      deps,
      Instance,
    )
    return node
  }
  Instance.element = element
  return Instance as any
}
