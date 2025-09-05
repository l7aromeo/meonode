import { DistributiveOmit } from '@mui/types'
import { TabsTypeMap } from '@mui/material/Tabs'
import * as React from 'react'
import { OverrideProps } from '@mui/material/OverridableComponent'

export interface TabListOwnProps extends DistributiveOmit<TabsTypeMap['props'], 'children' | 'value'> {
  /**
   * A list of `<Tab />` elements.
   */
  children?: React.ReactNode
}

export interface TabListTypeMap<AdditionalProps = Record<string, any>, RootComponent extends React.ElementType = TabsTypeMap['defaultComponent']> {
  props: AdditionalProps & TabListOwnProps
  defaultComponent: RootComponent
}

/**
 *
 * Demos:
 *
 * - [Tabs](https://mui.com/material-ui/react-tabs/)
 *
 * API:
 *
 * - [TabList API](https://mui.com/material-ui/api/tab-list/)
 * - inherits [Tabs API](https://mui.com/material-ui/api/tabs/)
 */
export type TabListProps<RootComponent extends React.ElementType = TabListTypeMap['defaultComponent'], AdditionalProps = Record<string, any>> = OverrideProps<
  TabListTypeMap<AdditionalProps, RootComponent>,
  RootComponent
>
