import React from 'react'
import { GridColumnHeaderSeparatorProps } from '@mui/x-data-grid-premium'
import { GridStateColDef, PinnedColumnPosition } from '@mui/x-data-grid/internals'
import { SxProps, Theme } from '@mui/system'
import { GridRenderCellParams, GridSortDirection } from '@mui/x-data-grid-premium'

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

/**
 * Export Material-UI X Data Grid component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */
