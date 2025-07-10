import React from 'react'
import createMuiNode from '@src/core'
import * as MuiDataGrid from '@mui/x-data-grid-pro'
import { GridStateColDef, PinnedColumnPosition } from '@mui/x-data-grid/internals'
import { SxProps, Theme } from '@mui/system'

interface GridColumnHeaderItemProps {
  colIndex: number
  colDef: GridStateColDef
  columnMenuOpen: boolean
  headerHeight: number
  isDragging: boolean
  isResizing: boolean
  isLast: boolean
  sortDirection: MuiDataGrid.GridSortDirection
  sortIndex?: number
  filterItemsCounter?: number
  hasFocus?: boolean
  tabIndex: 0 | -1
  disableReorder?: boolean
  separatorSide?: MuiDataGrid.GridColumnHeaderSeparatorProps['side']
  pinnedPosition?: PinnedColumnPosition
  pinnedOffset?: number
  style?: React.CSSProperties
  isLastUnpinned: boolean
  isSiblingFocused: boolean
  showLeftBorder: boolean
  showRightBorder: boolean
}

interface GridBooleanCellProps extends MuiDataGrid.GridRenderCellParams {
  hideDescendantCount?: boolean
}

interface SelectedRowCountProps {
  selectedRowCount: number
}

type GridSelectedRowCountProps = React.HTMLAttributes<HTMLDivElement> &
  SelectedRowCountProps & {
    sx?: SxProps<Theme>
  }

/**
 * Export Material-UI X Data Grid Pro component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */

export const DataGridPro = createMuiNode<React.ComponentType<MuiDataGrid.DataGridProProps>>(MuiDataGrid.DataGridPro)
export const GridApiContext = createMuiNode(MuiDataGrid.GridApiContext)
export const GridContextProvider = createMuiNode(MuiDataGrid.GridContextProvider)
export const GridPagination = createMuiNode(MuiDataGrid.GridPagination)

export const GridPanelHeader = createMuiNode(MuiDataGrid.GridPanelHeader)
export const GridPanelContent = createMuiNode(MuiDataGrid.GridPanelContent)
export const GridPanelWrapper = createMuiNode(MuiDataGrid.GridPanelWrapper)
export const GridPanelFooter = createMuiNode(MuiDataGrid.GridPanelFooter)

export const GridHeader = createMuiNode(MuiDataGrid.GridHeader)
export const GridHeaderCheckbox = createMuiNode(MuiDataGrid.GridHeaderCheckbox)
export const GridHeaderFilterMenu = createMuiNode(MuiDataGrid.GridHeaderFilterMenu)
export const GridHeaderFilterMenuContainer = createMuiNode(MuiDataGrid.GridHeaderFilterMenuContainer)

export const GridRow = createMuiNode(MuiDataGrid.GridRow)
export const GridRowCount = createMuiNode<React.ComponentType<MuiDataGrid.GridRowCountProps>>(MuiDataGrid.GridRowCount)
export const GridNoRowsOverlay = createMuiNode(MuiDataGrid.GridNoRowsOverlay)
export const GridSelectedRowCount = createMuiNode<React.ComponentType<GridSelectedRowCountProps>>(MuiDataGrid.GridSelectedRowCount)

export const GridFooter = createMuiNode(MuiDataGrid.GridFooter)
export const GridFooterContainer = createMuiNode(MuiDataGrid.GridFooterContainer)
export const GridFooterPlaceholder = createMuiNode(MuiDataGrid.GridFooterPlaceholder)
export const GridBody = createMuiNode(MuiDataGrid.GridBody)

export const GridActionsCell = createMuiNode(MuiDataGrid.GridActionsCell)
export const GridActionsCellItem = createMuiNode<React.ComponentType<MuiDataGrid.GridActionsCellItemProps>>(MuiDataGrid.GridActionsCellItem)
export const GridBooleanCell = createMuiNode<React.ComponentType<GridBooleanCellProps>>(MuiDataGrid.GridBooleanCell)
export const GridCell = createMuiNode(MuiDataGrid.GridCell)
export const GridCellCheckboxForwardRef = createMuiNode(MuiDataGrid.GridCellCheckboxForwardRef)
export const GridCellCheckboxRenderer = createMuiNode(MuiDataGrid.GridCellCheckboxRenderer)
export const GridDetailPanelToggleCell = createMuiNode(MuiDataGrid.GridDetailPanelToggleCell)
export const GridEditBooleanCell = createMuiNode(MuiDataGrid.GridEditBooleanCell)
export const GridEditDateCell = createMuiNode(MuiDataGrid.GridEditDateCell)
export const GridEditInputCell = createMuiNode(MuiDataGrid.GridEditInputCell)
export const GridEditSingleSelectCell = createMuiNode(MuiDataGrid.GridEditSingleSelectCell)
export const GridHeaderFilterCell = createMuiNode(MuiDataGrid.GridHeaderFilterCell)
export const GridRowReorderCell = createMuiNode(MuiDataGrid.GridRowReorderCell)
export const GridSkeletonCell = createMuiNode<React.ComponentType<MuiDataGrid.GridSkeletonCellProps>>(MuiDataGrid.GridSkeletonCell)
export const GridTreeDataGroupingCell = createMuiNode(MuiDataGrid.GridTreeDataGroupingCell)

export const GridColumnsManagement = createMuiNode(MuiDataGrid.GridColumnsManagement)
export const GridColumnHeaders = createMuiNode(MuiDataGrid.GridColumnHeaders)
export const GridColumnsPanel = createMuiNode(MuiDataGrid.GridColumnsPanel)
export const GridColumnHeaderMenu = createMuiNode(MuiDataGrid.GridColumnHeaderMenu)
export const GridColumnHeaderItem = createMuiNode<React.ComponentType<GridColumnHeaderItemProps>>(MuiDataGrid.GridColumnHeaderItem)
export const GridColumnHeaderFilterIconButton = createMuiNode(MuiDataGrid.GridColumnHeaderFilterIconButton)
export const GridColumnHeaderSeparator = createMuiNode<React.ComponentType<MuiDataGrid.GridColumnHeaderSeparatorProps>>(MuiDataGrid.GridColumnHeaderSeparator)
export const GridColumnHeaderTitle = createMuiNode(MuiDataGrid.GridColumnHeaderTitle)
export const GridNoColumnsOverlay = createMuiNode(MuiDataGrid.GridNoColumnsOverlay)

export const GridPrintExportMenuItem = createMuiNode(MuiDataGrid.GridPrintExportMenuItem)
export const GridCsvExportMenuItem = createMuiNode(MuiDataGrid.GridCsvExportMenuItem)

export const ExportCsv = createMuiNode(MuiDataGrid.ExportCsv)
export const ExportPrint = createMuiNode(MuiDataGrid.ExportPrint)

export const FilterPanelTrigger = createMuiNode(MuiDataGrid.FilterPanelTrigger)

export const GridArrowUpwardIcon = createMuiNode(MuiDataGrid.GridArrowUpwardIcon)
export const GridArrowDownwardIcon = createMuiNode(MuiDataGrid.GridArrowDownwardIcon)
export const GridKeyboardArrowRight = createMuiNode(MuiDataGrid.GridKeyboardArrowRight)
export const GridExpandMoreIcon = createMuiNode(MuiDataGrid.GridExpandMoreIcon)
export const GridFilterListIcon = createMuiNode(MuiDataGrid.GridFilterListIcon)
export const GridFilterAltIcon = createMuiNode(MuiDataGrid.GridFilterAltIcon)
export const GridSearchIcon = createMuiNode(MuiDataGrid.GridSearchIcon)
export const GridMenuIcon = createMuiNode(MuiDataGrid.GridMenuIcon)
export const GridCheckCircleIcon = createMuiNode(MuiDataGrid.GridCheckCircleIcon)
export const GridColumnIcon = createMuiNode(MuiDataGrid.GridColumnIcon)
export const GridSeparatorIcon = createMuiNode(MuiDataGrid.GridSeparatorIcon)
export const GridViewHeadlineIcon = createMuiNode(MuiDataGrid.GridViewHeadlineIcon)
export const GridTableRowsIcon = createMuiNode(MuiDataGrid.GridTableRowsIcon)
export const GridViewStreamIcon = createMuiNode(MuiDataGrid.GridViewStreamIcon)
export const GridTripleDotsVerticalIcon = createMuiNode(MuiDataGrid.GridTripleDotsVerticalIcon)
export const GridCloseIcon = createMuiNode(MuiDataGrid.GridCloseIcon)
export const GridAddIcon = createMuiNode(MuiDataGrid.GridAddIcon)
export const GridRemoveIcon = createMuiNode(MuiDataGrid.GridRemoveIcon)
export const GridLoadIcon = createMuiNode(MuiDataGrid.GridLoadIcon)
export const GridDragIcon = createMuiNode(MuiDataGrid.GridDragIcon)
export const GridCheckIcon = createMuiNode(MuiDataGrid.GridCheckIcon)
export const GridMoreVertIcon = createMuiNode(MuiDataGrid.GridMoreVertIcon)
export const GridVisibilityOffIcon = createMuiNode(MuiDataGrid.GridVisibilityOffIcon)
export const GridViewColumnIcon = createMuiNode(MuiDataGrid.GridViewColumnIcon)
export const GridClearIcon = createMuiNode(MuiDataGrid.GridClearIcon)
export const GridDeleteIcon = createMuiNode(MuiDataGrid.GridDeleteIcon)
export const GridDeleteForeverIcon = createMuiNode(MuiDataGrid.GridDeleteForeverIcon)
export const GridDownloadIcon = createMuiNode(MuiDataGrid.GridDownloadIcon)
