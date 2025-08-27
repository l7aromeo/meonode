'use strict'
import React from 'react'
import type { NodeInstance, NodeProps } from '@meonode/ui'
import { Node } from '@meonode/ui'
import { OverridableComponent, OverridableTypeMap, OverrideProps } from '@mui/material/OverridableComponent'
import { extendTheme } from '@mui/material'

declare global {
  const UNDEFINED_VOID_ONLY: unique symbol
}

// Memoized reference theme keys
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
  return similarity >= 0.25
}

// --- Types ------------------------------------------------------

type WithPolymorphic<TypeMap extends OverridableTypeMap, ComponentType extends React.ElementType> = TypeMap & {
  props: TypeMap['props'] & Partial<{ component: ComponentType }>
  defaultComponent: TypeMap['defaultComponent']
}

/**
 * Factory for Material-UI components.
 * @template AdditionalProps Extra props baked in when creating the factory.
 * @template TypeMap The OverridableTypeMap of the MUI component.
 * @template DefaultComponent The default underlying element of the MUI component.
 */
type MuiNodeFactory<
  AdditionalProps extends Record<string, any> = Record<string, any>,
  TypeMap extends OverridableTypeMap = OverridableTypeMap,
  DefaultComponent extends React.ElementType = TypeMap['defaultComponent'],
> = <CallProps extends Record<string, any> = Record<string, any>, ComponentType extends React.ElementType = DefaultComponent>(
  props?: NodeProps<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>> &
    Omit<
      OverrideProps<WithPolymorphic<TypeMap, ComponentType>, ComponentType>,
      keyof NodeProps<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>>
    > &
    AdditionalProps &
    CallProps,
) => NodeInstance<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>>

/**
 * Factory for generic React elements.
 * @template AdditionalProps Extra props baked in when creating the factory.
 * @template Element The React element type.
 */
type GenericNodeFactory<AdditionalProps extends Record<string, any> = Record<string, any>, Element extends React.ElementType = React.ElementType> = <
  CallProps extends Record<string, any> = Record<string, any>,
>(
  props?: NodeProps<Element> & AdditionalProps & CallProps,
) => NodeInstance<Element>

// --- Overloads --------------------------------------------------

/**
 * Create node factory for a Material-UI OverridableComponent.
 */
export default function createMuiNode<
  AdditionalProps extends Record<string, any> = Record<string, any>,
  TypeMap extends OverridableTypeMap = OverridableTypeMap,
  DefaultComponent extends React.ElementType = TypeMap['defaultComponent'],
>(
  element: OverridableComponent<TypeMap>,
  initialProps?: Partial<
    NodeProps<OverridableComponent<WithPolymorphic<TypeMap, DefaultComponent>>> & OverrideProps<WithPolymorphic<TypeMap, DefaultComponent>, DefaultComponent>
  > &
    AdditionalProps,
): MuiNodeFactory<AdditionalProps, TypeMap, DefaultComponent>

/**
 * Create node factory for a generic React element.
 */
export default function createMuiNode<AdditionalProps extends Record<string, any> = Record<string, any>, Element extends React.ElementType = React.ElementType>(
  element: Element,
  initialProps?: Partial<NodeProps<Element>> & AdditionalProps,
): GenericNodeFactory<AdditionalProps, Element>

// --- Implementation --------------------------------------------

export default function createMuiNode(element: any, initialProps: any = {}): any {
  return (props: any = {}) => {
    const merged = { ...initialProps, ...props }
    if (!isProbablyMuiTheme(merged?.theme)) {
      merged.nodetheme = merged.theme
      delete merged.theme
    }
    return Node(element, merged)
  }
}

export { createMuiNode }
