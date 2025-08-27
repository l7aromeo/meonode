import React from 'react'
import { GridColumnHeaderSeparatorProps, GridGroupNode } from '@mui/x-data-grid-premium'
import { GridStateColDef, PinnedColumnPosition } from '@mui/x-data-grid/internals'
import { SxProps, Theme } from '@mui/system'
import { GridRenderCellParams, GridSortDirection, GridMenuProps, GridColDef, GridFilterItem, GridFilterOperator } from '@mui/x-data-grid-premium'

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
  isLastUnpinned: boolean
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

export interface GridActionsCellProps extends Omit<GridRenderCellParams, 'api'> {
  api?: GridRenderCellParams['api']
  position?: GridMenuProps['position']
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
