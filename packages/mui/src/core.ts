'use strict'
import { ElementType } from 'react'
import type { HasRequiredProps, MergedProps, NodeElement, NodeInstance, NodeProps, PropsOf } from '@meonode/ui'
import { Node } from '@meonode/ui'
import { OverridableComponent, OverridableTypeMap, OverrideProps } from '@mui/material/OverridableComponent'
import { extendTheme } from '@mui/material/styles'

// --- Global type sentinel ---------------------------------------

declare global {
  const UNDEFINED_VOID_ONLY: unique symbol
}

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

type WithPolymorphic<TypeMap extends OverridableTypeMap, ComponentType extends ElementType> = Omit<TypeMap, 'props' | 'defaultComponent'> & {
  props: TypeMap['props'] & Partial<{ component: ComponentType }>
  defaultComponent: TypeMap['defaultComponent']
}

/**
 * Factory for Material-UI components.
 * @template InitialProperties Initial/Extra props baked in when creating the factory.
 * @template TypeMap The OverridableTypeMap of the MUI component.
 * @template DefaultComponent The default underlying element of the MUI component.
 */
type MuiNodeFactory<
  InitialProperties extends Record<string, any> = Record<string, any>,
  TypeMap extends OverridableTypeMap = OverridableTypeMap,
  DefaultComponent extends ElementType = TypeMap['defaultComponent'],
> = (<AdditionalProperties extends Record<string, any> = Record<string, any>, ComponentType extends ElementType = DefaultComponent>(
  props?: NodeProps<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>> &
    Omit<
      OverrideProps<WithPolymorphic<TypeMap, ComponentType>, ComponentType>,
      keyof NodeProps<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>>
    > &
    InitialProperties &
    AdditionalProperties,
) => NodeInstance<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>>) & { element: Element }

/**
 * Factory for generic React elements.
 * @template InitialProperties Initial/Extra props baked in when creating the factory.
 * @template Element The React element type.
 */
type GenericNodeFactory<Element extends NodeElement> =
  HasRequiredProps<PropsOf<Element>> extends true
    ? (<AdditionalProps extends Record<string, any> = Record<string, any>>(props: MergedProps<Element, AdditionalProps>) => NodeInstance<Element>) & {
        element: Element
      }
    : (<AdditionalProps extends Record<string, any> = Record<string, any>>(props?: MergedProps<Element, AdditionalProps>) => NodeInstance<Element>) & {
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
  initialProps?: Partial<
    NodeProps<OverridableComponent<WithPolymorphic<TypeMap, DefaultComponent>>> & OverrideProps<WithPolymorphic<TypeMap, DefaultComponent>, DefaultComponent>
  > &
    InitialProperties,
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
  const Instance = (props: any = {}) => {
    const merged = { ...initialProps, ...props }
    if (!isProbablyMuiTheme(merged?.theme)) {
      merged.nodetheme = merged.theme
      delete merged.theme
    }
    return Node(element, merged)
  }

  Instance.element = element
  return Instance
}

export { createMuiNode }
