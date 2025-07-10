'use strict'
import React from 'react'
import type { NodeInstance, NodeProps } from '@meonode/ui'
import { Node } from '@meonode/ui'
import { OverridableComponent, OverridableTypeMap, OverrideProps } from '@mui/material/OverridableComponent'
import { extendTheme } from '@mui/material'

/**
 * Determines if an object is likely to be a Material-UI theme object by comparing its structure
 * to a reference theme.
 * @param obj The object to evaluate as a potential MUI theme
 * @returns `true` if the object appears to be a MUI theme, `false` otherwise
 * @remarks
 * The function uses a heuristic approach by:
 * 1. Creating a reference theme using MUI's extendTheme()
 * 2. Comparing the keys of the input object with the reference theme
 * 3. Calculating a similarity score based on matching keys
 * 4. Considering it a theme if at least 25% of reference keys are present
 * @example
 * ```ts
 * const customTheme = {
 *   palette: { primary: { main: '#000' } },
 *   typography: { fontSize: 14 }
 * };
 *
 * if (isProbablyMuiTheme(customTheme)) {
 *   // Handle theme object
 * }
 * ```
 * @throws Will not throw, but returns false for null, non-objects, or invalid inputs
 */
export function isProbablyMuiTheme(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false

  const referenceTheme = extendTheme()
  const themeKeys = Object.keys(referenceTheme)
  const objKeys = Object.keys(obj as object)

  const commonKeys = objKeys.filter(key => themeKeys.includes(key))
  const similarity = commonKeys.length / themeKeys.length

  return similarity >= 0.25
}

/**
 * A utility type that extends an OverridableTypeMap to include a polymorphic `component` prop.
 * This allows the component to be overridden with a different React element type.
 * @template TMap - The base OverridableTypeMap to extend.
 * @template TComponent - The React element type to use for the `component` prop.
 */
type WithPolymorphic<TMap extends OverridableTypeMap, TComponent extends React.ElementType> = TMap & {
  props: TMap['props'] & Partial<{ component: TComponent }>
  defaultComponent: TMap['defaultComponent']
}

/**
 * Creates a function that generates a `NodeInstance` for a Material-UI component
 * with support for polymorphic behavior.
 * @template TMap - The OverridableTypeMap for the Material-UI component.
 * @template TDefaultComponent - The default React element type for the component.
 * @param element The Material-UI component to wrap.
 * @returns A function that takes props and returns a `NodeInstance` for the component.
 */
export default function createMuiNode<TMap extends OverridableTypeMap, TDefaultComponent extends React.ElementType = TMap['defaultComponent']>(
  element: OverridableComponent<TMap>,
): <T extends React.ElementType = TDefaultComponent>(
  props?: NodeProps<OverridableComponent<WithPolymorphic<TMap, T>>> &
    Omit<OverrideProps<WithPolymorphic<TMap, T>, T>, keyof NodeProps<OverridableComponent<WithPolymorphic<TMap, T>>>>,
) => NodeInstance<OverridableComponent<WithPolymorphic<TMap, T>>>

/**
 * Creates a function that generates a `NodeInstance` for a generic React element.
 * @template TElement - The React element type to wrap.
 * @param element The React element to wrap.
 * @returns A function that takes props and returns a `NodeInstance` for the element.
 */
export default function createMuiNode<TElement extends React.ElementType>(element: TElement): (props?: NodeProps<TElement>) => NodeInstance<TElement>

/**
 * Creates a function that generates a `NodeInstance` for any given element.
 * @param element The element to wrap.
 * @returns A function that takes props and returns a `NodeInstance` for the element.
 * @remarks
 * - If the `theme` prop is not a valid Material-UI theme, it is renamed to `nodetheme`.
 * - This ensures compatibility with the `Node` function.
 */
export default function createMuiNode(element: any): any {
  return (props: any = {}) => {
    if (!isProbablyMuiTheme(props?.theme)) {
      props.nodetheme = props.theme
      delete props.theme
    }
    return Node(element, props)
  }
}

/**
 * Exports the `createMuiNode` function for external use.
 */
export { createMuiNode }
