import React, { type ComponentProps, type ElementType, type ReactNode, createElement, isValidElement } from 'react'
import type {
  FunctionRendererProps,
  NodeElement,
  NodeElementType,
  NodeFunction,
  NodeInstance,
  NodeProps,
  FinalNodeProps,
  Children,
} from '@src/types/node.type.js'
import { isForwardRef, isMemo, isReactClassComponent } from '@src/helper/react-is.helper.js'
import { getCSSProps, getDOMProps, getElementTypeName, omitUndefined } from '@src/helper/common.helper.js'
import { __DEBUG__, COMPILED_MARKER, COMPILER_SCHEMA_KEYS, SUPPORTED_COMPILER_SCHEMAS } from '@src/constant/common.const.js'
import { BaseNode } from '@src/core.node.js'

/**
 * NodeUtil provides a collection of static utility methods and properties
 * used internally by BaseNode for various tasks such as hashing, shallow comparison,
 * and stable element ID generation. This centralizes common helper functions,
 * improving modularity and maintainability of the core library.
 */
export class NodeUtil {
  private constructor() {}

  private static readBooleanFlag(value: unknown, key: '__meonodeAcceptsServerCss' | '__meonodeProvidesServerTheme' | '__meonodeShieldsOwnProps'): boolean {
    if (typeof value !== 'function') return false
    try {
      return (value as unknown as Record<string, unknown>)[key] === true
    } catch {
      // Some client references throw when arbitrary properties are accessed on the server.
      return false
    }
  }

  // Determines if the current environment is server-side (Node.js) or client-side (browser).
  public static isServer = typeof window === 'undefined'

  // Unique ID generation for elements
  // Keys that stay top-level and must never be shadowed by a marker's c/d bucket
  private static readonly MARKER_SPECIAL_KEYS = new Set(['css', 'props', 'ref', 'key', 'children', 'as', 'theme', 'disableEmotion'])

  /**
   * Exactly the keys `processProps` pulls out of `rawProps` by name before its
   * rest destructure, so `_processCompiledProps` — which skips that destructure
   * to avoid copying every prop per node — can filter the same set while walking
   * `rawProps` directly.
   *
   * Deliberately *not* {@link MARKER_SPECIAL_KEYS}: that set also contains `as`
   * and `theme`, which the destructure leaves in place. Those must keep flowing
   * through classification and out to the element, and silently dropping them
   * was a real regression once already.
   */
  private static readonly DESTRUCTURED_SPECIAL_KEYS = new Set(['ref', 'key', 'children', 'css', 'props', 'disableEmotion'])

  // Cache for function prop toString() hashes to avoid repeated expensive serialization

  /**
   * Detects React/Next client reference functions used by RSC.
   * These must not be invoked on the server.
   */
  public static isClientReference(value: unknown): boolean {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false
    try {
      return (value as { $$typeof?: symbol }).$$typeof === Symbol.for('react.client.reference')
    } catch {
      return false
    }
  }

  /**
   * Detects function components that explicitly opt in to receiving MeoNode
   * `css` prop in server execution paths.
   */
  public static acceptsServerCss(value: unknown): boolean {
    return NodeUtil.readBooleanFlag(value, '__meonodeAcceptsServerCss')
  }

  /**
   * Detects components that provide a theme scope for server-side style resolution.
   */
  public static providesServerTheme(value: unknown): boolean {
    return NodeUtil.readBooleanFlag(value, '__meonodeProvidesServerTheme')
  }

  /**
   * Detects targets that re-run `Node()` over the props they are handed — the
   * `Component` HOC being the one that matters.
   *
   * Their props must be passed as `props` rather than spread top-level, or the
   * second pass classifies them and a component prop whose name matches a CSS
   * property (the case `props` exists to protect) is turned into a style.
   */
  public static shieldsOwnProps(value: unknown): boolean {
    return NodeUtil.readBooleanFlag(value, '__meonodeShieldsOwnProps')
  }

  /**
   * Type guard to check if an object is a NodeInstance.
   *
   * A NodeInstance is expected to be a non-null object with:
   * - an 'element' property,
   * - a 'render' method,
   * - a 'toPortal' method,
   * - and an 'isBaseNode' property.
   * @param obj The object to check.
   * @returns True if the object is a NodeInstance, false otherwise.
   */
  public static isNodeInstance = (obj: unknown): obj is NodeInstance => obj instanceof BaseNode

  /**
   * Generates a fast structural hash for CSS objects without full serialization.
   * This is an optimized hashing method that samples the first 10 keys for performance.
   * @param css The CSS object to hash.
   * @returns A hash string representing the CSS object structure.
   */

  /**
   * Detects the compiled marker's schema version, if present and supported.
   * Single source of truth for the marker-detection predicate shared by
   * `processProps` and `BaseNode._getStableKey`, so both stay in lockstep on
   * what counts as "a compiled call site".
   * @param props The raw props object to inspect.
   * @returns The schema version number, or undefined if absent/unsupported.
   */
  public static getCompiledSchema(props: Record<string, unknown>): number | undefined {
    const schema = props[COMPILED_MARKER]
    return typeof schema === 'number' && SUPPORTED_COMPILER_SCHEMAS.has(schema) ? schema : undefined
  }

  /**
   * The main prop processing pipeline. It splits style props from the rest and
   * assembles the final props object, with a fast path for simple props.
   * @param rawProps The original props to process.
   * @returns The processed props object ready for rendering.
   */

  /**
   * The compiled-marker branch of {@link processProps}, kept separate so it can
   * skip work rather than undo it.
   *
   * `processProps` runs once per rendered node, so every allocation here is paid
   * per node per render. The original version allocated unconditionally: the rest
   * destructure's copy of all props, an `Object.keys` array, a `passthrough`
   * object, two classified objects from `getCSSProps`/`getDOMProps`, a merged css
   * object, and then *two* more for `omitUndefined(objectLiteral)`. For a
   * fully-compiled call site — where every top-level key is a marker key — all of
   * the passthrough work produced empty objects that were then spread over
   * nothing.
   *
   * This version keeps identical output but allocates only what it needs:
   * `passthrough` is created lazily and the classification calls are skipped
   * entirely when there is nothing to classify, and the result object is built
   * directly instead of being constructed and then copied to drop `undefined`s.
   * @param rawProps The node's raw props, known to carry a supported marker.
   * @param schema The marker schema version from {@link getCompiledSchema}.
   * @returns The processed props, identical to what the legacy path produces.
   */
  private static _processCompiledProps(rawProps: Partial<NodeProps>, schema: number): FinalNodeProps {
    // Bucket key names are schema-dependent: schema 1 used bare `c`/`d`/`k`/`dyn`,
    // which a spread could collide with (`d` is a real SVG `<path>` attribute);
    // schema 2 namespaces them under the marker prefix. The stable-key fields are
    // consumed by `_getStableKey`, so they are stripped here, never forwarded.
    const schemaKeys = COMPILER_SCHEMA_KEYS[schema]
    const source = rawProps as Record<string, unknown>
    const markerCssProps = source[schemaKeys.css] as Record<string, unknown> | undefined
    const markerDomProps = source[schemaKeys.dom] as Record<string, unknown> | undefined

    const { ref, key, children, css, props: nativeProps, disableEmotion } = rawProps

    // Built only if a key survives both filters. `as` and `theme` deliberately do
    // *not* count as skippable specials here: they are not destructured above, so
    // they must reach `getDOMProps` and be forwarded, exactly as the legacy path
    // does. Dropping them was a real regression once already.
    let passthrough: Record<string, unknown> | undefined
    for (const propKey in source) {
      if (!Object.prototype.hasOwnProperty.call(source, propKey)) continue
      if (
        propKey === COMPILED_MARKER ||
        propKey === schemaKeys.css ||
        propKey === schemaKeys.dom ||
        propKey === schemaKeys.key ||
        propKey === schemaKeys.dyn ||
        NodeUtil.DESTRUCTURED_SPECIAL_KEYS.has(propKey)
      ) {
        continue
      }
      passthrough ??= {}
      passthrough[propKey] = source[propKey]
    }

    // `passthrough` may hold props the compiler never saw — e.g. createNode() merges
    // initialProps with call-site props at runtime, after the compiler already rewrote
    // the call site — so these must be classified like legacy, not assumed to be DOM props.
    const passthroughCssProps = passthrough === undefined ? undefined : getCSSProps(passthrough)
    const passthroughDomProps = passthrough === undefined ? undefined : getDOMProps(passthrough)

    // Precedence mirrors legacy's "call props override initial props" merge: top-level
    // passthrough < compiler-classified `c`/`d` < explicit `css` prop. Always a fresh
    // object, never an alias of the compiler's bucket, so downstream consumers keep
    // the same ownership guarantees the legacy path gave them.
    const finalCssProps = { ...passthroughCssProps, ...markerCssProps, ...css }

    if (__DEBUG__) {
      // A `c`/`d` bucket containing a special key (e.g. `ref`, `children`) would silently
      // override the real top-level value via the assignment below.
      const reservedInBuckets = [...Object.keys(markerCssProps ?? {}), ...Object.keys(markerDomProps ?? {})].filter(k => NodeUtil.MARKER_SPECIAL_KEYS.has(k))
      if (reservedInBuckets.length > 0) {
        console.warn(`MeoNode: Compiled marker c/d buckets contain reserved key(s) that override top-level values via spread: ${reservedInBuckets.join(', ')}.`)
      }
    }

    // Assembled directly rather than via `omitUndefined({ ...literal })`, which
    // allocated the literal and then a filtered copy of it. Assigning only defined
    // values reproduces `omitUndefined` exactly, including for the DOM buckets:
    // spreading them into the literal used to let their `undefined` entries through
    // to `omitUndefined`, which stripped them, so they are skipped here too.
    const result: Record<string, unknown> = {}
    if (ref !== undefined) result.ref = ref
    if (key !== undefined) result.key = key
    result.css = finalCssProps
    if (passthroughDomProps !== undefined) NodeUtil._assignDefined(result, passthroughDomProps)
    if (markerDomProps !== undefined) NodeUtil._assignDefined(result, markerDomProps)
    if (disableEmotion !== undefined) result.disableEmotion = disableEmotion
    result.nativeProps = nativeProps === undefined ? {} : omitUndefined(nativeProps)
    const processedChildren = NodeUtil._processChildren(children, disableEmotion)
    if (processedChildren !== undefined) result.children = processedChildren

    return result as FinalNodeProps
  }

  /**
   * Copies `source`'s own defined values onto `target`, matching what
   * `omitUndefined` would have dropped after a spread.
   * @param target The object to assign onto.
   * @param source The object to copy defined own values from.
   */
  private static _assignDefined(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
        target[key] = source[key]
      }
    }
  }

  public static processProps(rawProps: Partial<NodeProps> = {}): FinalNodeProps {
    // --- Compiled Marker Fast Path ---
    // Checked against `rawProps` *before* the rest destructure below, because that
    // destructure copies every remaining prop into a fresh object — a per-node
    // allocation the compiled path does not need and, at ~1 per rendered node,
    // one of the larger costs in an SSR pass. The marker key is never one of the
    // destructured specials, so testing `rawProps` is equivalent to testing
    // `restRawProps`.
    const compiledSchema = NodeUtil.getCompiledSchema(rawProps as Record<string, unknown>)
    if (compiledSchema !== undefined) {
      return NodeUtil._processCompiledProps(rawProps, compiledSchema)
    }

    const { ref, key, children, css, props: nativeProps = {}, disableEmotion, ...restRawProps } = rawProps

    // A marker whose schema this runtime does not know — output from a newer
    // compiler against an older `@meonode/ui`. Props are classified the legacy
    // way, which is correct, but the marker fields themselves are not special
    // to that path and would be forwarded to the element. React rejects
    // `__meo$`-prefixed names as invalid attributes, so nothing reaches the
    // DOM, but it warns once per field per node. Dropping them here keeps
    // forward compatibility silent instead of noisy.
    //
    // Guarded on the marker being present at all, so uncompiled call sites —
    // the overwhelming majority — pay a single `in` check and no iteration.
    if (COMPILED_MARKER in restRawProps) {
      for (const propKey in restRawProps) {
        if (propKey.startsWith(COMPILED_MARKER)) {
          delete (restRawProps as Record<string, unknown>)[propKey]
        }
      }
    }

    // --- Fast Path Optimization ---
    if (Object.keys(restRawProps).length === 0 && !css) {
      return omitUndefined({
        ref,
        key,
        disableEmotion,
        nativeProps: omitUndefined(nativeProps),
        children: NodeUtil._processChildren(children, disableEmotion),
      })
    }

    // --- Hybrid Caching Strategy ---
    const cacheableProps: Record<string, unknown> = {}
    const nonCacheableProps: Record<string, unknown> = {}

    // 1. Categorize props into cacheable (primitives) and non-cacheable (objects/functions).
    // Optimization: Use Object.keys loop instead of for..in for better performance and safety
    const keys = Object.keys(restRawProps)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const value = (restRawProps as Record<string, unknown>)[key]
      const type = typeof value
      if (type === 'string' || type === 'number' || type === 'boolean') {
        cacheableProps[key] = value
      } else {
        nonCacheableProps[key] = value
      }
    }

    // 2. CSS props are computed directly — nothing is cached across renders.
    const cachedCssProps = getCSSProps(cacheableProps)

    // 3. Process non-cacheable props on every render to ensure correctness for functions and objects.
    const nonCachedCssProps = getCSSProps(nonCacheableProps)
    const domProps = getDOMProps(restRawProps) // DOM props are always processed fresh.

    // 4. Assemble the final CSS object.
    const finalCssProps = { ...cachedCssProps, ...nonCachedCssProps, ...css }

    // --- Child Normalization ---
    const normalizedChildren = NodeUtil._processChildren(children, disableEmotion)

    // --- Final Assembly ---
    return omitUndefined({
      ref,
      key,
      css: finalCssProps,
      ...domProps,
      disableEmotion,
      nativeProps: omitUndefined(nativeProps),
      children: normalizedChildren,
    })
  }

  /**
   * Processes and normalizes children of the node.
   * Converts raw children (React elements, primitives, or other BaseNodes) into a consistent format.
   * Applies optimizations for single and multiple children scenarios.
   * @param children The raw children to process.
   * @param disableEmotion If true, emotion styling will be disabled for these children.
   * @param parentStableKey The stable key of the parent node, used for generating unique keys for children.
   * @returns The processed children in normalized format.
   */
  private static _processChildren(children: Children, disableEmotion?: boolean): Children {
    if (!children) return undefined
    if (typeof children === 'function') return children

    // Fast path for non-array (single child). Collapsing `[x]` to `x` is why a
    // bare child and a single-element array must key identically: by the time
    // the render loop derives positions, the two shapes are indistinguishable.
    if (!Array.isArray(children)) {
      return NodeUtil.processRawNode(children, disableEmotion)
    }

    // Fast path for single element array
    if (children.length === 1) {
      return NodeUtil.processRawNode(children[0], disableEmotion)
    }

    // General case: multiple children
    return children.map(child => NodeUtil.processRawNode(child, disableEmotion))
  }

  /**
   * The core normalization function for a single child. It takes any valid `NodeElement`
   * (primitive, React element, function, `BaseNode` instance) and converts it into a standardized `BaseNode`
   * instance if it isn't one already. This ensures a consistent structure for the iterative renderer.
   * Handles various node types including primitives, BaseNode instances, function-as-children, React elements,
   * component classes, and component instances.
   * @param node The node element to process and normalize.
   * @param disableEmotion If true, emotion styling will be disabled for this node.
   * @returns The normalized node element in BaseNode format.
   */
  public static processRawNode(node: NodeElement, disableEmotion?: boolean): NodeElement {
    // Primitives and null/undefined are returned as-is.
    if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return node

    // A BaseNode child is passed straight through. It carries no per-render
    // state, so there is nothing to clone.
    //
    // Propagating `disableEmotion` is the one case still requiring a new
    // instance, and it must not write through to the source node. `BaseNode`
    // stores the `rawProps` object it is given by reference, so constructing
    // from `node.rawProps` and then assigning onto `newNode.rawProps` mutated
    // the original: a node rendered under two parents, only one of which
    // disabled Emotion, lost its styling in both places permanently.
    //
    // The flag is folded in at construction instead, off a fresh object, so the
    // source node keeps the props it was built with.
    if (NodeUtil.isNodeInstance(node)) {
      if (disableEmotion && !node.rawProps.disableEmotion) {
        return new BaseNode(node.element, { ...node.rawProps, disableEmotion: true }, node.dependencies)
      }
      return node
    }

    // Handle function-as-a-child (render props).
    if (NodeUtil.isFunctionChild(node)) {
      return new BaseNode(NodeUtil.functionRenderer as NodeElementType, { props: { render: node, disableEmotion } }, undefined)
    }

    // Handle standard React elements.
    if (isValidElement(node)) {
      // React elements whose type is a client reference, lazy wrapper, or memo/forwardRef
      // are already finalized output from an upstream render. Re-wrapping them routes
      // through the core render branches again with the wrong element metadata (e.g. a
      // lazy-wrapped client component fails isClientReference/acceptsServerCss checks),
      // which produces a server-compiled className that diverges from the hash the
      // underlying client component emits during hydration.
      const elementType = node.type as unknown
      if (elementType && typeof elementType === 'object') {
        const typeSymbol = (elementType as { $$typeof?: symbol }).$$typeof
        if (
          typeSymbol === Symbol.for('react.client.reference') ||
          typeSymbol === Symbol.for('react.lazy') ||
          typeSymbol === Symbol.for('react.memo') ||
          typeSymbol === Symbol.for('react.forward_ref')
        ) {
          return node
        }
      }
      // Only extract style if it's a DOM element (string type)
      // For components, treat style as a normal prop
      if (typeof node.type === 'string') {
        const { style: childStyleObject, ...otherChildProps } = node.props as ComponentProps<ElementType>
        const combinedProps = { ...otherChildProps, ...(childStyleObject || {}) }
        return new BaseNode(
          node.type as ElementType,
          {
            ...combinedProps,
            ...(node.key !== null && node.key !== undefined ? { key: node.key } : {}),
            disableEmotion,
          },
          undefined,
        )
      }

      // For components, the props on an already-created element are final: they
      // were classified when that element was built. Re-wrapping used to spread
      // them back in at the top level, which sent them through classification a
      // second time — so a component prop whose name matches a CSS property was
      // converted into a style on the way through.
      //
      // That silently defeated `props`, the documented escape hatch for exactly
      // that case ("wrap it in `props` so the styling engine ignores it"). A
      // shielded `height` survived only while its element stayed the render
      // root; the moment it became someone's child it came back as a className.
      //
      // Handing them over as `props` marks them as already-final, so
      // classification skips them. `children` is lifted back out, since it is a
      // node-level concern rather than a component prop.
      const { children: elementChildren, ...finalComponentProps } = node.props as Record<string, unknown>
      return new BaseNode(
        node.type as ElementType,
        {
          props: finalComponentProps,
          ...(elementChildren !== undefined ? { children: elementChildren as Children } : {}),
          ...(node.key !== null && node.key !== undefined ? { key: node.key } : {}),
          disableEmotion,
        } as never,
        undefined,
      )
    }

    // Handle component classes and memos.
    if (isReactClassComponent(node) || isMemo(node) || isForwardRef(node)) {
      return new BaseNode(node as ElementType, { disableEmotion }, undefined)
    }

    // Handle component instances.
    if (node instanceof React.Component) {
      return NodeUtil.processRawNode(node.render(), disableEmotion)
    }

    return node
  }

  /**
   * A helper to reliably identify if a given function is a "function-as-a-child" (render prop)
   * rather than a standard Function Component.
   * Distinguishes between render prop functions and component functions by checking for React component signatures.
   * @param node The node to check.
   * @returns True if the node is a function-as-a-child, false otherwise.
   */
  public static isFunctionChild<E extends NodeElementType>(node: NodeElement): node is NodeFunction<E> {
    if (typeof node !== 'function' || isReactClassComponent(node) || isMemo(node) || isForwardRef(node)) return false
    try {
      return !(node.prototype && typeof node.prototype.render === 'function')
    } catch (error) {
      if (__DEBUG__) {
        console.error('MeoNode: Error checking if a node is a function child.', error)
      }
      return true
    }
  }

  /**
   * A special internal React component used to render "function-as-a-child" (render prop) patterns.
   * When a `BaseNode` receives a function as its `children` prop, it wraps that function
   * inside this `functionRenderer` component. This component then executes the render function
   * and processes its return value, normalizing it into a renderable ReactNode.
   *
   * This allows `BaseNode` to support render props while maintaining its internal processing
   * and normalization logic for the dynamically generated content.
   * @param render The function-as-a-child to execute.
   * @param disableEmotion Inherited flag to disable Emotion styling for children.
   * @returns The processed and rendered output of the render function, or null if an error occurs.
   */
  public static functionRenderer<E extends NodeElementType>({ render, disableEmotion }: FunctionRendererProps<E>): ReactNode | null | undefined {
    let result: NodeElement
    try {
      // Execute the render prop function to get its output.
      result = render()
    } catch (error) {
      if (__DEBUG__) {
        console.error('MeoNode: Error executing function-as-a-child.', error)
      }
      // If the render function throws, treat its output as null to prevent crashes.
      result = null
    }

    // Handle null, undefined, or primitive types results directly, as they are valid React render outputs.
    if (result === null || result === undefined || typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return result
    }

    // If the result is already a BaseNode instance, process it.
    if (NodeUtil.isNodeInstance(result)) {
      // If emotion is disabled for the parent and not explicitly re-enabled on the child,
      // create a new BaseNode with emotion disabled and render it.
      if (disableEmotion && !result.rawProps.disableEmotion) return new BaseNode(result.element, { ...result.rawProps, disableEmotion: true }).render()
      // Otherwise, render the existing BaseNode directly.
      return result.render()
    }

    // If the result is an array, it likely contains multiple children.
    if (Array.isArray(result)) {
      // Helper to generate a stable key for array items, crucial for React's reconciliation.
      const safeGetKey = (item: unknown, index: number) => {
        try {
          // Attempt to get a meaningful name for the element type.
          return `${getElementTypeName(item)}-${index}`
        } catch (error) {
          if (__DEBUG__) {
            console.error('MeoNode: Could not determine element type name for key in function-as-a-child.', error)
          }
          // Fallback to a generic key if type name cannot be determined.
          return `item-${index}`
        }
      }
      // Map over the array, processing each item and assigning a key.
      return result.map((item, index) =>
        NodeUtil.renderProcessedNode({ processedElement: NodeUtil.processRawNode(item, disableEmotion), passedKey: safeGetKey(item, index), disableEmotion }),
      )
    }

    // If the result is a React component instance (e.g., `new MyClassComponent()`).
    if (result instanceof React.Component) {
      return NodeUtil.renderProcessedNode({ processedElement: NodeUtil.processRawNode(result.render(), disableEmotion), disableEmotion })
    }

    // For any other non-primitive, non-array result, process it as a single NodeElement.
    const processedResult = NodeUtil.processRawNode(result as NodeElement, disableEmotion)
    // If processing yields a valid element, render it.
    if (processedResult) return NodeUtil.renderProcessedNode({ processedElement: processedResult, disableEmotion })
    // Fallback: return the original result if it couldn't be processed into a renderable node.
    return result as ReactNode
  }

  /**
   * Renders a processed `NodeElement` into a ReactNode.
   * This helper is primarily used by `functionRenderer` to handle the output of render props,
   * ensuring that `BaseNode` instances are correctly rendered and other React elements or primitives
   * are passed through. It also applies `disableEmotion` and `key` props as needed.
   *
   * This method is part of the child processing pipeline, converting internal `NodeElement` representations
   * into actual React elements that can be rendered by React.
   * @param processedElement The processed node element to render.
   * @param passedKey Optional key to apply to the rendered element.
   * @param disableEmotion Flag to disable emotion styling if needed.
   * @returns The rendered ReactNode.
   */
  public static renderProcessedNode({
    processedElement,
    passedKey,
    disableEmotion,
  }: {
    processedElement: NodeElement
    passedKey?: string
    disableEmotion?: boolean
  }) {
    // Initialize an object to hold common props that might be applied to the new BaseNode.
    const commonBaseNodeProps: Partial<NodeProps<ElementType>> = {}
    // If a `passedKey` is provided, add it to `commonBaseNodeProps`.
    // This key is typically used for React's reconciliation process.
    if (passedKey !== undefined) commonBaseNodeProps.key = passedKey

    // If the processed element is already a BaseNode instance.
    if (NodeUtil.isNodeInstance(processedElement)) {
      // Get the existing key from the raw props of the BaseNode.
      const existingKey = processedElement.rawProps?.key
      // Apply the `disableEmotion` flag to the raw props of the BaseNode.
      processedElement.rawProps.disableEmotion = disableEmotion
      // If the existing key is the same as the passed key, render the existing BaseNode directly.
      // This avoids unnecessary re-creation of the BaseNode instance.
      if (existingKey === passedKey) return processedElement.render()
      // Otherwise, create a new BaseNode instance, merging existing raw props with common props, then render it.
      return new BaseNode(processedElement.element, { ...processedElement.rawProps, ...commonBaseNodeProps }).render()
    }
    // If the processed element is a React class component (e.g., `class MyComponent extends React.Component`).
    // Create a new BaseNode for it, applying common props and `disableEmotion`, then render.
    if (isReactClassComponent(processedElement)) return new BaseNode(processedElement, { ...commonBaseNodeProps, disableEmotion }).render()
    // If the processed element is an instance of a React component (e.g., `new MyComponent()`).
    // Directly call its `render` method.
    if (processedElement instanceof React.Component) return processedElement.render()
    // If the processed element is a function (likely a functional component or a render prop that returned a component type).
    // Create a React element directly using `createElement`, passing the `passedKey`.
    if (typeof processedElement === 'function') return createElement(processedElement as ElementType, { key: passedKey })
    // For any other type (primitives, null, undefined, etc.), return it as a ReactNode.
    return processedElement as ReactNode
  }
}
