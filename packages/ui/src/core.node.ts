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
import { LIST_MARKER, LOCATION_MARKER } from '@src/constant/common.const.js'
import { isMergeableCss } from '@src/util/css.util.js'
import { NodeUtil } from '@src/util/node.util.js'
import { IS_REACT_SERVER_LAYER } from '@src/util/react-layer.util.js'
import { compileServerEmotionRule } from '@src/util/server-emotion.util.js'
import { replaceThemeTokensWithCssVars } from '@src/util/server-theme.util.js'
import { diagnosticsEnabled, reportThemeIssues } from '@src/util/theme-diagnostics.util.js'
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

function resolveChild(child: unknown, rendered: Map<BaseNode, ReactElement>, location: unknown): ReactNode {
  if (Array.isArray(child)) return child.map(c => resolveChild(c, rendered, location)) as unknown as ReactNode
  if (!NodeUtil.isNodeInstance(child)) return child as ReactNode
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
      workStack[stackPointer++] = { node: this, isProcessed: false, theme: undefined, anchor: null, inForeignNamespace: false }

      // Iterative depth-first traversal with explicit begin/complete phases to avoid recursion.
      while (stackPointer > 0) {
        const currentWork = workStack[stackPointer - 1]
        if (!currentWork) {
          stackPointer--
          continue
        }
        const { node, isProcessed, theme: inheritedTheme, anchor, inForeignNamespace } = currentWork

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
          // whether the child sits in SVG or MathML, where none can.
          const beginAs = (node.props as { as?: NodeElementType }).as
          const beginTarget = beginAs != null && isValidElementType(beginAs) ? beginAs : node.element
          const childAnchor = anchor ?? (canAnchorRules(beginTarget, node.props as Record<string, unknown>, inForeignNamespace) ? node : null)
          const childInForeignNamespace = inForeignNamespace || beginTarget === 'svg' || beginTarget === 'math'

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
            ...otherProps
          } = node.props

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
          if (hostChildren) {
            // Convert child placeholders into concrete React nodes:
            // - If it's a BaseNode, lookup its rendered ReactElement from the map.
            // - If it's already a React element, use it directly (with enhanced key).
            // - Otherwise treat as primitive ReactNode.
            const childArray = Array.isArray(hostChildren) ? hostChildren : [hostChildren]
            const childCount = childArray.length
            // Pre-allocate array to avoid resizing during iteration
            finalChildren = new Array(childCount)

            for (let i = 0; i < childCount; i++) {
              finalChildren[i] = resolveChild(childArray[i], renderedElements, callSiteLocation)
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
          // `diagnosticsEnabled()` is a call with a try/catch and a `process.env`
          // read, so it goes last, behind two property comparisons.
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
            element = createElement(node.element as ExoticComponent<FragmentProps>, { key }, ...childArguments)
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
            const shouldBypassStyledRendererOnServer = NodeUtil.isServer && IS_REACT_SERVER_LAYER
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
              element = createElement(StyledRenderer, { element: renderTarget, ...elementProps, css: cssForRenderer }, ...childArguments)
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
              const rule = compileServerEmotionRule(cssWithDefaults, elementProps.className, { share: typeof renderTarget !== 'string' })
              const elementPropsWithClassName = rule ? { ...elementProps, className: rule.className } : elementProps
              element = createElement(renderTarget, elementPropsWithClassName, ...childArguments)
              if (rule?.cssText) {
                const carrier = anchor ?? (canAnchorRules(renderTarget, elementProps as Record<string, unknown>, inForeignNamespace) ? node : null)
                const rules = carrier ? (anchoredRules.get(carrier) ?? new Map<string, ReactElement>()) : rootRules
                if (carrier) anchoredRules.set(carrier, rules)
                rules.set(rule.id, ruleElement(rule))
              }
            } else {
              // On server function components, keep css support for true server components.
              // For client references (e.g. next/link), do not forward css to avoid leaking
              // unknown attributes like css="[object Object]" into HTML.
              const shouldForwardCssDirectly = isStyledComponent && (!shouldBypassStyledRendererOnServer || NodeUtil.acceptsServerCss(renderTarget))
              const elementPropsWithCss = shouldForwardCssDirectly ? { ...elementProps, css } : elementProps
              element = createElement(renderTarget, elementPropsWithCss, ...childArguments)
            }
          }

          // A host carrying rules gets them as one trailing keyed slot, after its
          // own children, so none of those shift and the element stays the one
          // element it would be without them.
          const carriedRules = anchoredRules.get(node)
          if (carriedRules) element = cloneElement(element, undefined, ...childArguments, [...carriedRules.values()])

          // Store the rendered element so parent nodes can reference it.
          renderedElements.set(node, element)
        }
      }

      // Get the final rendered element for the root node of this render cycle.
      const rootElement = renderedElements.get(this) as ReactElement<FinalNodeProps>
      if (rootRules.size === 0) return rootElement

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
 * a whole map of rules, so the spread replaced it outright and a call site that
 * added one rule lost every pseudo-class, media query and `@supports` fallback
 * the factory had defined.
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
  if (isMergeableCss(factoryCss) && isMergeableCss(callSiteCss)) {
    combined.css = mergeCss(factoryCss, callSiteCss)
  } else if (stylesSomething(factoryCss) && stylesSomething(callSiteCss)) {
    combined.css = [factoryCss, callSiteCss]
  }
  return combined
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
  const Instance = <AdditionalProps, ExactProps extends object = object>(props?: MergedProps<E, AdditionalProps, ExactProps>, deps?: DependencyList) =>
    Node(element, combineFactoryProps(initialProps as Record<string, unknown> | undefined, props as Record<string, unknown> | undefined) as any, deps)
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
  ) =>
    Node(
      element,
      { ...combineFactoryProps(initialProps as Record<string, unknown> | undefined, props as Record<string, unknown> | undefined), children } as any,
      deps,
    )
  Instance.element = element
  return Instance as any
}
