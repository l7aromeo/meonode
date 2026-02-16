import React from 'react'
import { GridColumnHeaderSeparatorProps, GridGroupNode } from '@mui/x-data-grid-premium'
import { GridStateColDef, PinnedColumnPosition } from '@mui/x-data-grid/internals'
import { SxProps, Theme } from '@mui/system'
import {
  GridRenderCellParams,
  GridSortDirection,
  GridMenuProps,
  GridColDef,
  GridFilterItem,
  GridFilterOperator,
  GridRowParams,
  GridTreeNodeWithRender,
  GridValidRowModel,
} from '@mui/x-data-grid-premium'

export interface GridColumnHeaderItemProps {
  colIndex: number
  colDef: GridStateColDef
  columnMenuOpen: boolean
  headerHeight: number
  isDragging: boolean
  isResizing: boolean
  isLast: boolean
  sortDirection: GridSortDirection
  sortIndex?: number
  filterItemsCounter?: number
  hasFocus?: boolean
  tabIndex: 0 | -1
  disableReorder?: boolean
  separatorSide?: GridColumnHeaderSeparatorProps['side']
  pinnedPosition?: PinnedColumnPosition
  pinnedOffset?: number
  style?: React.CSSProperties
  isSiblingFocused: boolean
  showLeftBorder: boolean
  showRightBorder: boolean
}

export interface GridBooleanCellProps extends GridRenderCellParams {
  hideDescendantCount?: boolean
}

export interface SelectedRowCountProps {
  selectedRowCount: number
}

export type GridSelectedRowCountProps = React.HTMLAttributes<HTMLDivElement> &
  SelectedRowCountProps & {
    sx?: SxProps<Theme>
  }

export interface GridTreeDataGroupingCellProps extends GridRenderCellParams<any, any, any, GridGroupNode> {
  hideDescendantCount?: boolean

  /**
   * The cell offset multiplier used for calculating cell offset (`rowNode.depth * offsetMultiplier` px).
   * @default 2
   */
  offsetMultiplier?: number
}

export interface GridActionsCellProps<
  R extends GridValidRowModel = any,
  V = any,
  F = V,
  N extends GridTreeNodeWithRender = GridTreeNodeWithRender,
> extends Omit<GridRenderCellParams<R, V, F, N>, 'api'> {
  api?: GridRenderCellParams['api']
  position?: GridMenuProps['position']
  children: React.ReactNode

  /**
   * If true, the children passed to the component will not be validated.
   * If false, only `GridActionsCellItem` and `React.Fragment` are allowed as children.
   * Only use this prop if you know what you are doing.
   * @default false
   */
  suppressChildrenValidation?: boolean

  /**
   * Callback to fire before the menu gets opened.
   * Use this callback to prevent the menu from opening.
   * @param {GridRowParams<R>} params Row parameters.
   * @param {React.MouseEvent<HTMLElement>} event The event triggering this callback.
   * @returns {boolean} if the menu should be opened.
   */
  onMenuOpen?: (params: GridRowParams<R>, event: React.MouseEvent<HTMLElement>) => boolean

  /**
   * Callback to fire before the menu gets closed.
   * Use this callback to prevent the menu from closing.
   * @param {GridRowParams<R>} params Row parameters.
   * @param {React.MouseEvent<HTMLElement> | React.KeyboardEvent | MouseEvent | TouchEvent | undefined} event The event triggering this callback.
   * @returns {boolean} if the menu should be closed.
   */
  onMenuClose?: (params: GridRowParams<R>, event: React.MouseEvent<HTMLElement> | React.KeyboardEvent | MouseEvent | TouchEvent | undefined) => boolean
}

export interface GridHeaderFilterMenuProps {
  field: GridColDef['field']
  applyFilterChanges: (item: GridFilterItem) => void
  operators: GridFilterOperator<any, any, any>[]
  item: GridFilterItem
  open: boolean
  id: string
  labelledBy: string
  target: HTMLElement | null
  showClearItem: boolean
  clearFilterItem: () => void
}

export interface RowCountProps {
  rowCount: number
  visibleRowCount: number
}

export type GridRowCountProps = React.HTMLAttributes<HTMLDivElement> &
  RowCountProps & {
    sx?: SxProps<Theme>
  }
