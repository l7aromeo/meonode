'use strict'
import type { ElementType } from 'react'
import type {
  DependencyList,
  HasCSSCompatibleStyleProp,
  HasRequiredProps,
  NodeElementType,
  NodeInstance,
  NodeProps,
  PolymorphicProps,
  PropsOf,
  ThemedCSSProperties,
} from '@meonode/ui'
import { Node } from '@meonode/ui'
import type { BaseProps, OverridableComponent, OverridableTypeMap } from '@mui/material/OverridableComponent'
import { extendTheme } from '@mui/material/styles'

// --- Theme detection --------------------------------------------

let memoizedReferenceThemeKeys: string[] | null = null

function getReferenceThemeKeys(): string[] {
  if (memoizedReferenceThemeKeys === null) {
    const referenceTheme = extendTheme()
    memoizedReferenceThemeKeys = Object.keys(referenceTheme)
  }
  return memoizedReferenceThemeKeys
}

export function isProbablyMuiTheme(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false
  const referenceThemeKeys = getReferenceThemeKeys()
  const objKeys = Object.keys(obj as object)
  const commonKeys = objKeys.filter(key => referenceThemeKeys.includes(key))
  const similarity = commonKeys.length / referenceThemeKeys.length
  // Must share at least 3 keys AND 25% similarity
  return commonKeys.length >= 3 && similarity >= 0.25
}

// --- Types ------------------------------------------------------

/**
 * Public type alias for the factory returned by `createMuiNode`. Use this to annotate
 * exported wrappers so TypeScript can write the annotation verbatim into the emitted
 * `.d.ts` (avoiding TS4023 / TS2883 when MUI's inferred prop types live in non-portable
 * deep `*.mjs` paths). Routes OverridableComponents to the polymorphic factory and
 * everything else to the generic element factory.
 */
export type WrappedMui<E> =
  E extends OverridableComponent<infer TypeMap>
    ? OverridableTypeMap extends TypeMap
      ? E extends ElementType
        ? GenericNodeFactory<E>
        : never
      : MuiNodeFactory<object, TypeMap>
    : E extends ElementType
      ? GenericNodeFactory<E>
      : never

/**
 * Keys owned by `@meonode/ui` that must not be replaced when layering MUI `BaseProps`
 * on top of `NodeProps`. Without this, `BaseProps.children` (`ReactNode`) wins over
 * meonode's `Children` (NodeInstance / node factories / async nodes).
 */
type MeonodeReservedKeys = 'children' | 'css' | 'disableEmotion' | 'props'

/** MUI component props with meonode-reserved keys stripped so they never override {@link NodeProps}. */
type MuiBaseProps<TypeMap extends OverridableTypeMap> = Omit<BaseProps<TypeMap>, MeonodeReservedKeys>

/**
 * Top-level themed CSS props from {@link NodeProps} (gated by style-tag support on
 * `ComponentType`). These always win at runtime (meonode Emotion processing) and
 * in typing. MUI props that share a name with a CSS property (e.g. Button palette
 * `color`) are stripped from the MUI layer here — pass them via {@link NodeProps}'s
 * `props` passthrough to skip meonode CSS processing and reach MUI unchanged.
 */
type MeonodeDirectCssProps<ComponentType extends ElementType> = HasCSSCompatibleStyleProp<PropsOf<ComponentType>> extends true ? ThemedCSSProperties : object

/** MUI `BaseProps` with direct-CSS keys removed so {@link MeonodeDirectCssProps} wins for them. */
type MuiBasePropsForMerge<TypeMap extends OverridableTypeMap, ComponentType extends ElementType> = Omit<
  MuiBaseProps<TypeMap>,
  keyof MeonodeDirectCssProps<ComponentType>
>

/**
 * Props accepted by an OverridableComponent wrapper for a resolved root element.
 *
 * Built so the resolved element (`ComponentType`) drives DOM/event prop types when
 * forwarding to the root (e.g. `onClick` typed for `<a>` when `component="a"`).
 * MUI component props from `MuiBasePropsForMerge` take precedence over overlapping
 * root element props (e.g. Accordion `onChange` vs div `onChange`). meonode-only
 * extras (`css`, `children` as `Children`, `props` passthrough, `ref`/`key`,
 * `disableEmotion`, and direct themed CSS props when the root supports style tags)
 * stay on {@link NodeProps} / {@link MeonodeDirectCssProps} — direct CSS always
 * wins over MUI for the same key at runtime; use `props` to reach MUI without
 * meonode CSS processing.
 *
 * The Emotion-style `as` prop is explicitly forbidden here (`as?: never`).
 * OverridableComponents are polymorphic via MUI's own `component` prop, which
 * routes through MUI's styling/behavior; `@meonode/ui`'s `as` swaps the element
 * at the Emotion layer and would bypass MUI entirely. The `as?: never` overrides
 * the wrapper's permissive index signature so misuse is a type error (use
 * `component` instead). `as` remains available on the generic factory.
 * @template TypeMap The OverridableTypeMap of the MUI component.
 * @template ComponentType The resolved root element type.
 */
type MuiNodeProps<TypeMap extends OverridableTypeMap, ComponentType extends ElementType> = Omit<
  NodeProps<ComponentType>,
  keyof MuiBasePropsForMerge<TypeMap, ComponentType>
> &
  MuiBasePropsForMerge<TypeMap, ComponentType> &
  MeonodeDirectCssProps<ComponentType> & { as?: never }

/**
 * Factory for Material-UI OverridableComponents.
 *
 * Single generic signature (MUI-style): `ComponentType` defaults to the component's
 * default element and is inferred from the optional `component` prop when present.
 * This keeps `component` optional on the default call while still narrowing DOM/event
 * props when it is set — without a separate overload that incorrectly surfaces
 * "Property 'component' is missing" when overload resolution fails elsewhere.
 * @template InitialProperties Initial/Extra props baked in when creating the factory.
 * @template TypeMap The OverridableTypeMap of the MUI component.
 * @template DefaultComponent The default underlying element of the MUI component.
 */
type MuiNodeFactory<
  InitialProperties,
  TypeMap extends OverridableTypeMap = OverridableTypeMap,
  DefaultComponent extends ElementType = TypeMap['defaultComponent'],
> = {
  <ComponentType extends ElementType = DefaultComponent>(
    props?: MuiNodeProps<TypeMap, ComponentType> & InitialProperties,
    deps?: DependencyList,
  ): NodeInstance<NoInfer<ComponentType>>
} & { element: ElementType }

/**
 * Factory for generic React elements.
 *
 * Mirrors `@meonode/ui`'s own factory typing: an optional `As` generic adds
 * Emotion-style element polymorphism via the `as` prop (intrinsic tags only,
 * gated off for `NO_STYLE_TAGS`). When `as` is omitted, `As` defaults to
 * `Element` so this stays identical to the previous `MergedProps<Element, …>`
 * behavior. `NoInfer` on the return keeps `As` from being inferred via children.
 *
 * Note: this is the GENERIC path (plain elements / non-overridable components).
 * MUI OverridableComponents keep their own `component` prop (see
 * {@link MuiNodeFactory}); `as` would swap the whole element at the Emotion
 * layer and bypass MUI, so it is intentionally not offered there.
 * @template Element The React element type.
 */
type GenericNodeFactory<Element extends ElementType> =
  HasRequiredProps<PropsOf<Element>> extends true
    ? (<AdditionalProps, ExactProps extends object = object, As extends NodeElementType = Element>(
        props: PolymorphicProps<Element, As, AdditionalProps, ExactProps>,
        deps?: DependencyList,
      ) => NodeInstance<NoInfer<As>>) & {
        element: Element
      }
    : (<AdditionalProps, ExactProps extends object = object, As extends NodeElementType = Element>(
        props?: PolymorphicProps<Element, As, AdditionalProps, ExactProps>,
        deps?: DependencyList,
      ) => NodeInstance<NoInfer<As>>) & {
        element: Element
      }

// --- Overloads --------------------------------------------------

/**
 * Create node factory for a Material-UI OverridableComponent.
 */
export default function createMuiNode<
  InitialProperties extends Record<string, any>,
  TypeMap extends OverridableTypeMap,
  DefaultComponent extends ElementType = TypeMap['defaultComponent'],
>(
  element: OverridableComponent<TypeMap>,
  initialProps?: Partial<MuiNodeProps<TypeMap, DefaultComponent>> & InitialProperties,
): MuiNodeFactory<InitialProperties, TypeMap, DefaultComponent>

/**
 * Create node factory for a generic React element.
 */
export default function createMuiNode<InitialProperties extends Record<string, any>, Element extends ElementType>(
  element: Element,
  initialProps?: Partial<NodeProps<Element>> & InitialProperties,
): GenericNodeFactory<Element>

// --- Implementation --------------------------------------------

export default function createMuiNode(element: any, initialProps: any = {}): any {
  const Instance = (props: any = {}, deps?: DependencyList) => {
    const merged = { ...initialProps, ...props }
    if (!isProbablyMuiTheme(merged?.theme)) {
      merged.nodetheme = merged.theme
      delete merged.theme
    }
    return Node(element, merged, deps)
  }

  Instance.element = element
  return Instance
}

export { createMuiNode }
