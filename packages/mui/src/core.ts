'use strict'
import React from 'react'
import type { NodeInstance, NodeProps } from '@meonode/ui'
import { Node } from '@meonode/ui'
import type { OverridableComponent, OverridableTypeMap, OverrideProps } from '@mui/material/OverridableComponent'
import { extendTheme } from '@mui/material'

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
  // stricter: must share at least 3 keys AND 25% similarity
  return commonKeys.length >= 3 && similarity >= 0.25
}

// --- Types ------------------------------------------------------

/**
 * Polymorphic extension for MUI OverridableTypeMap.
 * Preserves all fields and adds optional `component`.
 */
type WithPolymorphic<TypeMap extends OverridableTypeMap, C extends React.ElementType> = Omit<TypeMap, 'props' | 'defaultComponent'> & {
  props: TypeMap['props'] & { component?: C }
  defaultComponent: TypeMap['defaultComponent']
}

type MergedProps<Props, AdditionalProps, CallProps extends Record<string, any> | undefined = undefined> = CallProps extends undefined
  ? Omit<Props, keyof AdditionalProps> & AdditionalProps
  : Omit<Props, keyof AdditionalProps | keyof CallProps> & AdditionalProps & CallProps

/**
 * Factory for Material-UI components.
 */
type MuiNodeFactory<
  AdditionalProps extends Record<string, any> = Record<string, any>,
  TypeMap extends OverridableTypeMap = OverridableTypeMap,
  DefaultComponent extends React.ElementType = TypeMap['defaultComponent'],
> = (<CallProps extends Record<string, any> = Record<string, any>, ComponentType extends React.ElementType = DefaultComponent>(
  props?: MergedProps<
    NodeProps<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>> &
      Omit<
        OverrideProps<WithPolymorphic<TypeMap, ComponentType>, ComponentType>,
        keyof NodeProps<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>>
      >,
    AdditionalProps,
    CallProps
  >,
) => NodeInstance<OverridableComponent<WithPolymorphic<TypeMap, ComponentType>>>) & { element: Element }

/**
 * Factory for generic React elements.
 */
type GenericNodeFactory<AdditionalProps extends Record<string, any> = Record<string, any>, Element extends React.ElementType = React.ElementType> = (<
  CallProps extends Record<string, any> = Record<string, any>,
>(
  props?: MergedProps<NodeProps<Element>, AdditionalProps, CallProps>,
) => NodeInstance<Element>) & { element: Element }

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
  initialProps?: MergedProps<
    Partial<
      NodeProps<OverridableComponent<WithPolymorphic<TypeMap, DefaultComponent>>> & OverrideProps<WithPolymorphic<TypeMap, DefaultComponent>, DefaultComponent>
    >,
    AdditionalProps
  >,
): MuiNodeFactory<AdditionalProps, TypeMap, DefaultComponent>

/**
 * Create node factory for a generic React element.
 */
export default function createMuiNode<AdditionalProps extends Record<string, any> = Record<string, any>, Element extends React.ElementType = React.ElementType>(
  element: Element,
  initialProps?: MergedProps<Partial<NodeProps<Element>>, AdditionalProps>,
): GenericNodeFactory<AdditionalProps, Element>

// --- Implementation --------------------------------------------

export default function createMuiNode(element: any, initialProps: any = {}): any {
  const Instance = (props: any = {}) => {
    const merged = { ...initialProps, ...props }

    if (!isProbablyMuiTheme(merged?.theme)) {
      merged.nodetheme = merged.theme
      delete merged.theme
    }

    return Node(element, merged) as NodeInstance<typeof element>
  }

  Instance.element = element
  Instance.displayName = `createMuiNode(${(element as any).displayName || (element as any).name || 'Anonymous'})`

  return Instance
}

export { createMuiNode }
