import React from 'react'
import createMuiNode from '@src/core.js'
import {
  DataGridPro as MuiDataGridPro,
  GridApiContext as MuiGridApiContext,
  GridContextProvider as MuiGridContextProvider,
  GridColumnHeaders as MuiGridColumnHeaders,
  GridColumnHeaderItem as MuiGridColumnHeaderItem,
  GridColumnHeaderSeparator as MuiGridColumnHeaderSeparator,
  GridColumnHeaderFilterIconButton as MuiGridColumnHeaderFilterIconButton,
  GridColumnHeaderTitle as MuiGridColumnHeaderTitle,
  GridColumnHeaderMenu as MuiGridColumnHeaderMenu,
  GridColumnMenu as MuiGridColumnMenu,
  GridColumnMenuColumnsItem as MuiGridColumnMenuColumnsItem,
  GridColumnMenuContainer as MuiGridColumnMenuContainer,
  GridColumnMenuFilterItem as MuiGridColumnMenuFilterItem,
  GridColumnMenuHideItem as MuiGridColumnMenuHideItem,
  GridColumnMenuManageItem as MuiGridColumnMenuManageItem,
  GridColumnMenuSortItem as MuiGridColumnMenuSortItem,
  GridColumnMenuPinningItem as MuiGridColumnMenuPinningItem,
  GridActionsCell as MuiGridActionsCell,
  GridActionsCellItem as MuiGridActionsCellItem,
  GridBooleanCell as MuiGridBooleanCell,
  GridCell as MuiGridCell,
  GridCellCheckboxForwardRef as MuiGridCellCheckboxForwardRef,
  GridCellCheckboxRenderer as MuiGridCellCheckboxRenderer,
  GridDetailPanelToggleCell as MuiGridDetailPanelToggleCell,
  GridEditBooleanCell as MuiGridEditBooleanCell,
  GridEditDateCell as MuiGridEditDateCell,
  GridEditInputCell as MuiGridEditInputCell,
  GridEditSingleSelectCell as MuiGridEditSingleSelectCell,
  GridHeaderFilterCell as MuiGridHeaderFilterCell,
  GridHeaderFilterMenu as MuiGridHeaderFilterMenu,
  GridHeaderFilterMenuContainer as MuiGridHeaderFilterMenuContainer,
  GridRowReorderCell as MuiGridRowReorderCell,
  GridSkeletonCell as MuiGridSkeletonCell,
  GridTreeDataGroupingCell as MuiGridTreeDataGroupingCell,
  GridBody as MuiGridBody,
  GridFooter as MuiGridFooter,
  GridFooterContainer as MuiGridFooterContainer,
  GridFooterPlaceholder as MuiGridFooterPlaceholder,
  GridHeader as MuiGridHeader,
  GridHeaderCheckbox as MuiGridHeaderCheckbox,
  GridRow as MuiGridRow,
  GridRowCount as MuiGridRowCount,
  GridNoRowsOverlay as MuiGridNoRowsOverlay,
  GridNoColumnsOverlay as MuiGridNoColumnsOverlay,
  GridSelectedRowCount as MuiGridSelectedRowCount,
  GridPagination as MuiGridPagination,
  GridPanel as MuiGridPanel,
  GridPanelContent as MuiGridPanelContent,
  GridPanelFooter as MuiGridPanelFooter,
  GridPanelHeader as MuiGridPanelHeader,
  GridPanelWrapper as MuiGridPanelWrapper,
  GridColumnsPanel as MuiGridColumnsPanel,
  GridColumnsManagement as MuiGridColumnsManagement,
  GridFilterPanel as MuiGridFilterPanel,
  GridFilterForm as MuiGridFilterForm,
  GridFilterInputBoolean as MuiGridFilterInputBoolean,
  GridFilterInputDate as MuiGridFilterInputDate,
  GridFilterInputMultipleSingleSelect as MuiGridFilterInputMultipleSingleSelect,
  GridFilterInputMultipleValue as MuiGridFilterInputMultipleValue,
  GridFilterInputSingleSelect as MuiGridFilterInputSingleSelect,
  GridFilterInputValue as MuiGridFilterInputValue,
  FilterPanelTrigger as MuiFilterPanelTrigger,
  GridToolbar as MuiGridToolbar,
  GridToolbarExport as MuiGridToolbarExport,
  GridCsvExportMenuItem as MuiGridCsvExportMenuItem,
  GridPrintExportMenuItem as MuiGridPrintExportMenuItem,
  GridToolbarFilterButton as MuiGridToolbarFilterButton,
  GridToolbarQuickFilter as MuiGridToolbarQuickFilter,
  Toolbar as MuiToolbar,
  ToolbarButton as MuiToolbarButton,
  QuickFilter as MuiQuickFilter,
  QuickFilterClear as MuiQuickFilterClear,
  QuickFilterControl as MuiQuickFilterControl,
  QuickFilterTrigger as MuiQuickFilterTrigger,
  ExportCsv as MuiExportCsv,
  ExportPrint as MuiExportPrint,
  GridArrowUpwardIcon as MuiGridArrowUpwardIcon,
  GridArrowDownwardIcon as MuiGridArrowDownwardIcon,
  GridKeyboardArrowRight as MuiGridKeyboardArrowRight,
  GridExpandMoreIcon as MuiGridExpandMoreIcon,
  GridFilterListIcon as MuiGridFilterListIcon,
  GridFilterAltIcon as MuiGridFilterAltIcon,
  GridSearchIcon as MuiGridSearchIcon,
  GridMenuIcon as MuiGridMenuIcon,
  GridCheckCircleIcon as MuiGridCheckCircleIcon,
  GridColumnIcon as MuiGridColumnIcon,
  GridSeparatorIcon as MuiGridSeparatorIcon,
  GridViewHeadlineIcon as MuiGridViewHeadlineIcon,
  GridTableRowsIcon as MuiGridTableRowsIcon,
  GridViewStreamIcon as MuiGridViewStreamIcon,
  GridTripleDotsVerticalIcon as MuiGridTripleDotsVerticalIcon,
  GridCloseIcon as MuiGridCloseIcon,
  GridAddIcon as MuiGridAddIcon,
  GridRemoveIcon as MuiGridRemoveIcon,
  GridLoadIcon as MuiGridLoadIcon,
  GridDragIcon as MuiGridDragIcon,
  GridCheckIcon as MuiGridCheckIcon,
  GridMoreVertIcon as MuiGridMoreVertIcon,
  GridVisibilityOffIcon as MuiGridVisibilityOffIcon,
  GridViewColumnIcon as MuiGridViewColumnIcon,
  GridClearIcon as MuiGridClearIcon,
  GridDeleteIcon as MuiGridDeleteIcon,
  GridDeleteForeverIcon as MuiGridDeleteForeverIcon,
  GridDownloadIcon as MuiGridDownloadIcon,
  GridPushPinRightIcon as MuiGridPushPinRightIcon,
  GridPushPinLeftIcon as MuiGridPushPinLeftIcon,
  DataGridProProps,
  GridSkeletonCellProps,
  GridActionsCellItemProps,
  GridColumnHeaderSeparatorProps,
} from '@mui/x-data-grid-pro'
import {
  GridBooleanCellProps,
  GridColumnHeaderItemProps,
  GridHeaderFilterMenuProps,
  GridSelectedRowCountProps,
  GridTreeDataGroupingCellProps,
  GridRowCountProps,
  GridActionsCellProps,
} from '@src/lib/mui.x-data-grid-pro.type.js'

/**
 * Export Material-UI X Data Grid Pro component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */

// Main Data Grid components
export const DataGridPro = createMuiNode(MuiDataGridPro as React.ComponentType<DataGridProProps>)


// Context components
export const GridApiContext = createMuiNode(MuiGridApiContext)
export const GridContextProvider = createMuiNode(MuiGridContextProvider)


// Column header components
export const GridColumnHeaders = createMuiNode(MuiGridColumnHeaders)
export const GridColumnHeaderItem = createMuiNode(MuiGridColumnHeaderItem as React.ComponentType<GridColumnHeaderItemProps>)
export const GridColumnHeaderSeparator = createMuiNode(MuiGridColumnHeaderSeparator as React.ComponentType<GridColumnHeaderSeparatorProps>)
export const GridColumnHeaderFilterIconButton = createMuiNode(MuiGridColumnHeaderFilterIconButton)
export const GridColumnHeaderTitle = createMuiNode(MuiGridColumnHeaderTitle)
export const GridColumnHeaderMenu = createMuiNode(MuiGridColumnHeaderMenu)


// Column menu components
export const GridColumnMenu = createMuiNode(MuiGridColumnMenu)
export const GridColumnMenuColumnsItem = createMuiNode(MuiGridColumnMenuColumnsItem)
export const GridColumnMenuContainer = createMuiNode(MuiGridColumnMenuContainer)
export const GridColumnMenuFilterItem = createMuiNode(MuiGridColumnMenuFilterItem)
export const GridColumnMenuHideItem = createMuiNode(MuiGridColumnMenuHideItem)
export const GridColumnMenuManageItem = createMuiNode(MuiGridColumnMenuManageItem)
export const GridColumnMenuSortItem = createMuiNode(MuiGridColumnMenuSortItem)
export const GridColumnMenuPinningItem = createMuiNode(MuiGridColumnMenuPinningItem)


// Cell components
export const GridActionsCell = createMuiNode(MuiGridActionsCell as React.ComponentType<GridActionsCellProps>)
export const GridActionsCellItem = createMuiNode(MuiGridActionsCellItem as React.ComponentType<GridActionsCellItemProps>)
export const GridBooleanCell = createMuiNode(MuiGridBooleanCell as React.ComponentType<GridBooleanCellProps>)
export const GridCell = createMuiNode(MuiGridCell)
export const GridCellCheckboxForwardRef = createMuiNode(MuiGridCellCheckboxForwardRef)
export const GridCellCheckboxRenderer = createMuiNode(MuiGridCellCheckboxRenderer)
export const GridDetailPanelToggleCell = createMuiNode(MuiGridDetailPanelToggleCell)
export const GridEditBooleanCell = createMuiNode(MuiGridEditBooleanCell)
export const GridEditDateCell = createMuiNode(MuiGridEditDateCell)
export const GridEditInputCell = createMuiNode(MuiGridEditInputCell)
export const GridEditSingleSelectCell = createMuiNode(MuiGridEditSingleSelectCell)
export const GridHeaderFilterCell = createMuiNode(MuiGridHeaderFilterCell)
export const GridRowReorderCell = createMuiNode(MuiGridRowReorderCell)
export const GridSkeletonCell = createMuiNode(MuiGridSkeletonCell as React.ComponentType<GridSkeletonCellProps>)
export const GridTreeDataGroupingCell = createMuiNode(MuiGridTreeDataGroupingCell as React.ComponentType<GridTreeDataGroupingCellProps>)


// Header and row components
export const GridHeader = createMuiNode(MuiGridHeader)
export const GridHeaderCheckbox = createMuiNode(MuiGridHeaderCheckbox)
export const GridHeaderFilterMenu = createMuiNode(MuiGridHeaderFilterMenu as React.ComponentType<GridHeaderFilterMenuProps>)
export const GridHeaderFilterMenuContainer = createMuiNode(MuiGridHeaderFilterMenuContainer)

export const GridRow = createMuiNode(MuiGridRow)
export const GridRowCount = createMuiNode(MuiGridRowCount as React.ComponentType<GridRowCountProps>)
export const GridNoRowsOverlay = createMuiNode(MuiGridNoRowsOverlay)
export const GridNoColumnsOverlay = createMuiNode(MuiGridNoColumnsOverlay)
export const GridSelectedRowCount = createMuiNode(MuiGridSelectedRowCount as React.ComponentType<GridSelectedRowCountProps>)


// Footer and body components
export const GridFooter = createMuiNode(MuiGridFooter)
export const GridFooterContainer = createMuiNode(MuiGridFooterContainer)
export const GridFooterPlaceholder = createMuiNode(MuiGridFooterPlaceholder)
export const GridBody = createMuiNode(MuiGridBody)


// Panel components
export const GridPanel = createMuiNode(MuiGridPanel)
export const GridPanelContent = createMuiNode(MuiGridPanelContent)
export const GridPanelFooter = createMuiNode(MuiGridPanelFooter)
export const GridPanelHeader = createMuiNode(MuiGridPanelHeader)
export const GridPanelWrapper = createMuiNode(MuiGridPanelWrapper)


// Column management components
export const GridColumnsPanel = createMuiNode(MuiGridColumnsPanel)
export const GridColumnsManagement = createMuiNode(MuiGridColumnsManagement)


// Filter panel components
export const GridFilterPanel = createMuiNode(MuiGridFilterPanel)
export const GridFilterForm = createMuiNode(MuiGridFilterForm)
export const GridFilterInputBoolean = createMuiNode(MuiGridFilterInputBoolean)
export const GridFilterInputDate = createMuiNode(MuiGridFilterInputDate)
export const GridFilterInputMultipleSingleSelect = createMuiNode(MuiGridFilterInputMultipleSingleSelect)
export const GridFilterInputMultipleValue = createMuiNode(MuiGridFilterInputMultipleValue)
export const GridFilterInputSingleSelect = createMuiNode(MuiGridFilterInputSingleSelect)
export const GridFilterInputValue = createMuiNode(MuiGridFilterInputValue)
export const FilterPanelTrigger = createMuiNode(MuiFilterPanelTrigger)


// Toolbar components
export const GridToolbar = createMuiNode(MuiGridToolbar)
export const GridToolbarExport = createMuiNode(MuiGridToolbarExport)
export const GridCsvExportMenuItem = createMuiNode(MuiGridCsvExportMenuItem)
export const GridPrintExportMenuItem = createMuiNode(MuiGridPrintExportMenuItem)
export const GridToolbarFilterButton = createMuiNode(MuiGridToolbarFilterButton)
export const GridToolbarQuickFilter = createMuiNode(MuiGridToolbarQuickFilter)
export const Toolbar = createMuiNode(MuiToolbar)
export const ToolbarButton = createMuiNode(MuiToolbarButton)


// Quick filter components
export const QuickFilter = createMuiNode(MuiQuickFilter)
export const QuickFilterClear = createMuiNode(MuiQuickFilterClear)
export const QuickFilterControl = createMuiNode(MuiQuickFilterControl)
export const QuickFilterTrigger = createMuiNode(MuiQuickFilterTrigger)


// Export components
export const ExportCsv = createMuiNode(MuiExportCsv)
export const ExportPrint = createMuiNode(MuiExportPrint)


// Icon components
export const GridArrowUpwardIcon = createMuiNode(MuiGridArrowUpwardIcon)
export const GridArrowDownwardIcon = createMuiNode(MuiGridArrowDownwardIcon)
export const GridKeyboardArrowRight = createMuiNode(MuiGridKeyboardArrowRight)
export const GridExpandMoreIcon = createMuiNode(MuiGridExpandMoreIcon)
export const GridFilterListIcon = createMuiNode(MuiGridFilterListIcon)
export const GridFilterAltIcon = createMuiNode(MuiGridFilterAltIcon)
export const GridSearchIcon = createMuiNode(MuiGridSearchIcon)
export const GridMenuIcon = createMuiNode(MuiGridMenuIcon)
export const GridCheckCircleIcon = createMuiNode(MuiGridCheckCircleIcon)
export const GridColumnIcon = createMuiNode(MuiGridColumnIcon)
export const GridSeparatorIcon = createMuiNode(MuiGridSeparatorIcon)
export const GridViewHeadlineIcon = createMuiNode(MuiGridViewHeadlineIcon)
export const GridTableRowsIcon = createMuiNode(MuiGridTableRowsIcon)
export const GridViewStreamIcon = createMuiNode(MuiGridViewStreamIcon)
export const GridTripleDotsVerticalIcon = createMuiNode(MuiGridTripleDotsVerticalIcon)
export const GridCloseIcon = createMuiNode(MuiGridCloseIcon)
export const GridAddIcon = createMuiNode(MuiGridAddIcon)
export const GridRemoveIcon = createMuiNode(MuiGridRemoveIcon)
export const GridLoadIcon = createMuiNode(MuiGridLoadIcon)
export const GridDragIcon = createMuiNode(MuiGridDragIcon)
export const GridCheckIcon = createMuiNode(MuiGridCheckIcon)
export const GridMoreVertIcon = createMuiNode(MuiGridMoreVertIcon)
export const GridVisibilityOffIcon = createMuiNode(MuiGridVisibilityOffIcon)
export const GridViewColumnIcon = createMuiNode(MuiGridViewColumnIcon)
export const GridClearIcon = createMuiNode(MuiGridClearIcon)
export const GridDeleteIcon = createMuiNode(MuiGridDeleteIcon)
export const GridDeleteForeverIcon = createMuiNode(MuiGridDeleteForeverIcon)
export const GridDownloadIcon = createMuiNode(MuiGridDownloadIcon)
export const GridPushPinRightIcon = createMuiNode(MuiGridPushPinRightIcon)
export const GridPushPinLeftIcon = createMuiNode(MuiGridPushPinLeftIcon)


// Pagination components
export const GridPagination = createMuiNode(MuiGridPagination)
