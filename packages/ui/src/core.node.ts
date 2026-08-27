import {
  type ComponentProps,
  createElement,
  type ElementType,
  type ExoticComponent,
  Fragment,
  type FragmentProps,
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
import { isFragment, isValidElementType } from '@src/helper/react-is.helper.js'
import { getComponentType, getElementTypeName, hasNoStyleTag, getGlobalState } from '@src/helper/common.helper.js'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import MeoMemo from '@src/components/meo-memo.client.js'
import { NodeUtil } from '@src/util/node.util.js'
import { compileServerEmotionClassName } from '@src/util/server-emotion.util.js'
import { getActiveServerTheme, replaceThemeTokensWithCssVars, setActiveServerTheme } from '@src/util/server-theme.util.js'
import { reportThemeIssues } from '@src/util/theme-diagnostics.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'

const RENDER_CONTEXT_POOL_KEY = Symbol.for('@meonode/ui/BaseNode/renderContextPool')

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

    if (NodeUtil.isServer && NodeUtil.providesServerTheme(element)) {
      const themeCandidate = (rawProps as { theme?: unknown }).theme
      if (themeCandidate && typeof themeCandidate === 'object' && 'system' in (themeCandidate as object)) {
        const resolvedTheme = themeCandidate as Theme
        // Only the *active theme* is tracked globally, for server-side
        // `theme.*` token -> `var(--meonode-theme-*)` resolution. The variable
        // definitions themselves are emitted by ThemeProvider's own render
        // output; they are deliberately not accumulated here, since a
        // process-global map is shared across concurrent SSR requests.
        setActiveServerTheme(resolvedTheme)
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
      this._props = NodeUtil.processProps(this.rawProps)
    }
    return this._props
  }

  /**
   * Returns the dependency list associated with this node.
   * Mirrors React hook semantics, because it is one: the list is handed to
   * `useMemo` inside the `MeoMemo` fiber that holds this node's subtree.
   * `undefined` means the node is not memoized at all and is rebuilt with its
   * parent.
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
      workStack[stackPointer++] = { node: this, isProcessed: false, theme: undefined }

      // Iterative depth-first traversal with explicit begin/complete phases to avoid recursion.
      while (stackPointer > 0) {
        const currentWork = workStack[stackPointer - 1]
        if (!currentWork) {
          stackPointer--
          continue
        }
        const { node, isProcessed, theme: inheritedTheme } = currentWork

        const getActiveTheme = (props: FinalNodeProps, current?: Theme): Theme | undefined => {
          const candidate = (props as { theme?: unknown }).theme
          if (candidate && typeof candidate === 'object' && 'system' in (candidate as object)) {
            return candidate as Theme
          }
          return current ?? getActiveServerTheme()
        }

        if (!isProcessed) {
          // Begin phase: mark processed and push child BaseNodes onto the stack (in reverse order)
          currentWork.isProcessed = true
          const children = node.props.children
          const activeTheme = getActiveTheme(node.props, inheritedTheme)

          if (children) {
            // Only consider BaseNode children for further traversal; primitives and React elements are terminal.
            const childArray = Array.isArray(children) ? children : [children]

            // --- Count BaseNode children for capacity check (avoids .filter() allocation) ---
            let nodeChildCount = 0
            for (let j = 0; j < childArray.length; j++) {
              if (NodeUtil.isNodeInstance(childArray[j])) nodeChildCount++
            }

            ensureCapacity(stackPointer + nodeChildCount)

            for (let i = childArray.length - 1; i >= 0; i--) {
              const child = childArray[i]
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

              workStack[stackPointer++] = { node: child, isProcessed: false, theme: activeTheme }
            }
          }
        } else {
          // Complete phase
          stackPointer--

          // Extract node props. Non-present props default to undefined via destructuring.
          // `as` is the Emotion-style polymorphic target: it is consumed here (never
          // forwarded to the DOM) and only used to swap the rendered element below.
          const { children: childrenInProps, key, css, nativeProps, disableEmotion, as: asTarget, ...otherProps } = node.props
          const activeTheme = getActiveTheme(node.props, inheritedTheme)

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
          let finalChildren: ReactNode[] = []

          if (childrenInProps) {
            // Convert child placeholders into concrete React nodes:
            // - If it's a BaseNode, lookup its rendered ReactElement from the map.
            // - If it's already a React element, use it directly (with enhanced key).
            // - Otherwise treat as primitive ReactNode.
            const childArray = Array.isArray(childrenInProps) ? childrenInProps : [childrenInProps]
            const childCount = childArray.length
            // Pre-allocate array to avoid resizing during iteration
            finalChildren = new Array(childCount)

            for (let i = 0; i < childCount; i++) {
              const child = childArray[i]
              if (NodeUtil.isNodeInstance(child)) {
                const rendered = renderedElements.get(child)
                if (!rendered) {
                  throw new Error(`[MeoNode] Missing rendered element for child node: ${getElementTypeName(child.element)}`)
                }
                finalChildren[i] = rendered
              } else {
                finalChildren[i] = child
              }
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
          const elementProps = replaceThemeTokensWithCssVars({
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

          let element: ReactElement<FinalNodeProps>

          // Handle fragments specially: create fragment element with key and children.
          if (node.element === Fragment || isFragment(node.element)) {
            element = createElement(node.element as ExoticComponent<FragmentProps>, { key }, ...finalChildren)
          } else {
            // StyledRenderer for emotion-based styling unless explicitly disabled or no styles are present.
            // StyledRenderer handles SSR hydration and emotion CSS injection when css prop exists or element has style tags.
            // All element-shape decisions use `renderTarget` so an `as` swap is honored consistently.
            const isStyledComponent = !disableEmotion && (css || !hasNoStyleTag(renderTarget)) && Object.keys(css || {}).length > 0
            const shouldBypassStyledRendererOnServer = NodeUtil.isServer && typeof renderTarget !== 'string'
            // Keep server/client on the same StyledRenderer path for client references.
            // This avoids Emotion hash drift not only for theme tokens, but also for raw
            // CSS values (e.g. "red", "#ff0000") that would otherwise use different
            // server vs client compilation routes.
            const shouldUseRuntimeThemeOnServer = isStyledComponent && shouldBypassStyledRendererOnServer && NodeUtil.isClientReference(renderTarget)

            if ((isStyledComponent && !shouldBypassStyledRendererOnServer) || shouldUseRuntimeThemeOnServer) {
              // `elementProps` was already pre-processed above, so only `css`
              // needs the var conversion here on the server. Aligning with the
              // client runtime's vars-mode resolution keeps the Emotion class
              // hash identical across SSR/CSR.
              const cssForRenderer = NodeUtil.isServer ? replaceThemeTokensWithCssVars(css) : css
              element = createElement(StyledRenderer, { element: renderTarget, ...elementProps, css: cssForRenderer }, ...finalChildren)
            } else if (isStyledComponent && shouldBypassStyledRendererOnServer && !NodeUtil.acceptsServerCss(renderTarget)) {
              // Emit `var(--meonode-theme-*)` on the server so the generated Emotion class
              // matches the client runtime output — unifies the class hash across SSR/CSR.
              // `replaceThemeTokensWithCssVars` runs even when activeTheme is undefined
              // (e.g., RSC/SSR bundler-layer split where the layout-set global state does not
              // carry into the client page's SSR pass), so string tokens still produce vars.
              // `processFunctions: true` executes any callable theme refs in `css`.
              const themedCss = ThemeUtil.resolveObjWithTheme(replaceThemeTokensWithCssVars(css), activeTheme, {
                processFunctions: true,
              })
              // Development only; no-ops in production. Mirrors the client-side
              // report in `StyledRenderer` so a bad token surfaces on whichever
              // side happened to render it.
              reportThemeIssues(themedCss, activeTheme)
              const cssWithDefaults = ThemeUtil.resolveDefaultStyle(themedCss)
              const serverCssClassName = compileServerEmotionClassName(cssWithDefaults)
              const mergedClassName = [elementProps.className, serverCssClassName].filter(Boolean).join(' ') || undefined
              const elementPropsWithClassName = mergedClassName ? { ...elementProps, className: mergedClassName } : elementProps
              element = createElement(renderTarget, elementPropsWithClassName, ...finalChildren)
            } else {
              // On server function components, keep css support for true server components.
              // For client references (e.g. next/link), do not forward css to avoid leaking
              // unknown attributes like css="[object Object]" into HTML.
              const shouldForwardCssDirectly = isStyledComponent && (!shouldBypassStyledRendererOnServer || NodeUtil.acceptsServerCss(renderTarget))
              const elementPropsWithCss = shouldForwardCssDirectly ? { ...elementProps, css } : elementProps
              element = createElement(renderTarget, elementPropsWithCss, ...finalChildren)
            }
          }

          // Store the rendered element so parent nodes can reference it.
          renderedElements.set(node, element)
        }
      }

      // Get the final rendered element for the root node of this render cycle.
      const rootElement = renderedElements.get(this) as ReactElement<FinalNodeProps>

      return rootElement
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
}

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
  return new BaseNode(element, props as NodeProps<E>, deps) as unknown as NodeInstance<NoInfer<As>>
}

// Export the Node factory as the main export
export { Node }

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
  const Instance = <AdditionalProps, ExactProps extends object = object>(props?: MergedProps<E, AdditionalProps, ExactProps>, deps?: DependencyList) =>
    Node(element, { ...initialProps, ...props } as any, deps)
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
  ) => Node(element, { ...initialProps, ...props, children } as any, deps)
  Instance.element = element
  return Instance as any
}
