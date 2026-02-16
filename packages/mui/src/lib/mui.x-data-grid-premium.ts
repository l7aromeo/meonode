import React from 'react'
import createMuiNode from '@src/core.js'
import {
  DataGridPremium as MuiDataGridPremium,
  GridApiContext as MuiGridApiContext,
  GridContextProvider as MuiGridContextProvider,
  GridPagination as MuiGridPagination,
  GridAiAssistantPanel as MuiGridAiAssistantPanel,
  GridChartsPanel as MuiGridChartsPanel,
  GridPanelHeader as MuiGridPanelHeader,
  GridPanelContent as MuiGridPanelContent,
  GridPanelWrapper as MuiGridPanelWrapper,
  GridPanelFooter as MuiGridPanelFooter,
  GridPivotPanel as MuiGridPivotPanel,
  GridEmptyPivotOverlay as MuiGridEmptyPivotOverlay,
  GridHeader as MuiGridHeader,
  GridHeaderCheckbox as MuiGridHeaderCheckbox,
  GridHeaderFilterMenu as MuiGridHeaderFilterMenu,
  GridHeaderFilterMenuContainer as MuiGridHeaderFilterMenuContainer,
  GridRow as MuiGridRow,
  GridRowCount as MuiGridRowCount,
  GridNoRowsOverlay as MuiGridNoRowsOverlay,
  GridNoColumnsOverlay as MuiGridNoColumnsOverlay,
  GridSelectedRowCount as MuiGridSelectedRowCount,
  GridFooter as MuiGridFooter,
  GridFooterContainer as MuiGridFooterContainer,
  GridFooterPlaceholder as MuiGridFooterPlaceholder,
  GridBody as MuiGridBody,
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
  GridRowReorderCell as MuiGridRowReorderCell,
  GridSkeletonCell as MuiGridSkeletonCell,
  GridTreeDataGroupingCell as MuiGridTreeDataGroupingCell,
  GridColumnsManagement as MuiGridColumnsManagement,
  GridColumnHeaders as MuiGridColumnHeaders,
  GridColumnsPanel as MuiGridColumnsPanel,
  GridColumnHeaderMenu as MuiGridColumnHeaderMenu,
  GridColumnHeaderItem as MuiGridColumnHeaderItem,
  GridColumnHeaderFilterIconButton as MuiGridColumnHeaderFilterIconButton,
  GridColumnHeaderSeparator as MuiGridColumnHeaderSeparator,
  GridColumnHeaderTitle as MuiGridColumnHeaderTitle,
  GridColumnMenuGroupingItem as MuiGridColumnMenuGroupingItem,
  GridColumnMenuAggregationItem as MuiGridColumnMenuAggregationItem,
  GridExcelExportMenuItem as MuiGridExcelExportMenuItem,
  GridPrintExportMenuItem as MuiGridPrintExportMenuItem,
  GridCsvExportMenuItem as MuiGridCsvExportMenuItem,
  ExportCsv as MuiExportCsv,
  ExportPrint as MuiExportPrint,
  ExportExcel as MuiExportExcel,
  FilterPanelTrigger as MuiFilterPanelTrigger,
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
  GridWorkspacesIcon as MuiGridWorkspacesIcon,
  GridGroupWorkIcon as MuiGridGroupWorkIcon,
  GridFunctionsIcon as MuiGridFunctionsIcon,
  GridSendIcon as MuiGridSendIcon,
  GridMicIcon as MuiGridMicIcon,
  GridMicOffIcon as MuiGridMicOffIcon,
  GridMoveToTopIcon as MuiGridMoveToTopIcon,
  GridMoveToBottomIcon as MuiGridMoveToBottomIcon,
  GridExpandLessIcon as MuiGridExpandLessIcon,
  GridPivotIcon as MuiGridPivotIcon,
  GridAssistantIcon as MuiGridAssistantIcon,
  GridPromptIcon as MuiGridPromptIcon,
  GridRerunIcon as MuiGridRerunIcon,
  GridHistoryIcon as MuiGridHistoryIcon,
  GridChartsIcon as MuiGridChartsIcon,
  GridSyncIcon as MuiGridSyncIcon,
  GridSyncDisabledIcon as MuiGridSyncDisabledIcon,
  Toolbar as MuiToolbar,
  ToolbarButton as MuiToolbarButton,
  PivotPanelTrigger as MuiPivotPanelTrigger,
  ChartsPanelTrigger as MuiChartsPanelTrigger,
  AiAssistantPanelTrigger as MuiAiAssistantPanelTrigger,
  PromptField as MuiPromptField,
  PromptFieldControl as MuiPromptFieldControl,
  PromptFieldSend as MuiPromptFieldSend,
  PromptFieldRecord as MuiPromptFieldRecord,
  QuickFilter as MuiQuickFilter,
  QuickFilterClear as MuiQuickFilterClear,
  QuickFilterControl as MuiQuickFilterControl,
  QuickFilterTrigger as MuiQuickFilterTrigger,
  DataGridPremiumProps,
  GridSkeletonCellProps,
  GridActionsCellItemProps,
  GridColumnHeaderSeparatorProps,
} from '@mui/x-data-grid-premium'
import {
  GridActionsCellProps,
  GridBooleanCellProps,
  GridColumnHeaderItemProps,
  GridHeaderFilterMenuProps,
  GridSelectedRowCountProps,
  GridTreeDataGroupingCellProps,
  GridRowCountProps,
} from '@src/lib/mui.x-data-grid-premium.type.js'

/**
 * Export Material-UI X Data Grid Premium component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */

// Main Data Grid components
export const DataGridPremium = createMuiNode(MuiDataGridPremium as React.ComponentType<DataGridPremiumProps>)

// Context components
export const GridApiContext = createMuiNode(MuiGridApiContext)
export const GridContextProvider = createMuiNode(MuiGridContextProvider)

// Panel components
export const GridAiAssistantPanel = createMuiNode(MuiGridAiAssistantPanel)
export const GridChartsPanel = createMuiNode(MuiGridChartsPanel)

export const GridPanelHeader = createMuiNode(MuiGridPanelHeader)
export const GridPanelContent = createMuiNode(MuiGridPanelContent)
export const GridPanelWrapper = createMuiNode(MuiGridPanelWrapper)
export const GridPanelFooter = createMuiNode(MuiGridPanelFooter)

// Pivot panel components
export const GridPivotPanel = createMuiNode(MuiGridPivotPanel)
export const GridEmptyPivotOverlay = createMuiNode(MuiGridEmptyPivotOverlay)

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

// Column management components
export const GridColumnsManagement = createMuiNode(MuiGridColumnsManagement)
export const GridColumnHeaders = createMuiNode(MuiGridColumnHeaders)
export const GridColumnsPanel = createMuiNode(MuiGridColumnsPanel)
export const GridColumnHeaderMenu = createMuiNode(MuiGridColumnHeaderMenu)
export const GridColumnHeaderItem = createMuiNode(MuiGridColumnHeaderItem as React.ComponentType<GridColumnHeaderItemProps>)
export const GridColumnHeaderFilterIconButton = createMuiNode(MuiGridColumnHeaderFilterIconButton)
export const GridColumnHeaderSeparator = createMuiNode(MuiGridColumnHeaderSeparator as React.ComponentType<GridColumnHeaderSeparatorProps>)
export const GridColumnHeaderTitle = createMuiNode(MuiGridColumnHeaderTitle)
export const GridColumnMenuGroupingItem = createMuiNode(MuiGridColumnMenuGroupingItem)
export const GridColumnMenuAggregationItem = createMuiNode(MuiGridColumnMenuAggregationItem)

// Export components
export const GridExcelExportMenuItem = createMuiNode(MuiGridExcelExportMenuItem)
export const GridPrintExportMenuItem = createMuiNode(MuiGridPrintExportMenuItem)
export const GridCsvExportMenuItem = createMuiNode(MuiGridCsvExportMenuItem)

export const ExportCsv = createMuiNode(MuiExportCsv)
export const ExportPrint = createMuiNode(MuiExportPrint)
export const ExportExcel = createMuiNode(MuiExportExcel)

// Trigger components
export const FilterPanelTrigger = createMuiNode(MuiFilterPanelTrigger)
export const PivotPanelTrigger = createMuiNode(MuiPivotPanelTrigger)
export const ChartsPanelTrigger = createMuiNode(MuiChartsPanelTrigger)
export const AiAssistantPanelTrigger = createMuiNode(MuiAiAssistantPanelTrigger)

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
export const GridWorkspacesIcon = createMuiNode(MuiGridWorkspacesIcon)
export const GridGroupWorkIcon = createMuiNode(MuiGridGroupWorkIcon)
export const GridFunctionsIcon = createMuiNode(MuiGridFunctionsIcon)
export const GridSendIcon = createMuiNode(MuiGridSendIcon)
export const GridMicIcon = createMuiNode(MuiGridMicIcon)
export const GridMicOffIcon = createMuiNode(MuiGridMicOffIcon)
export const GridMoveToTopIcon = createMuiNode(MuiGridMoveToTopIcon)
export const GridMoveToBottomIcon = createMuiNode(MuiGridMoveToBottomIcon)
export const GridExpandLessIcon = createMuiNode(MuiGridExpandLessIcon)
export const GridPivotIcon = createMuiNode(MuiGridPivotIcon)
export const GridAssistantIcon = createMuiNode(MuiGridAssistantIcon)
export const GridPromptIcon = createMuiNode(MuiGridPromptIcon)
export const GridRerunIcon = createMuiNode(MuiGridRerunIcon)
export const GridHistoryIcon = createMuiNode(MuiGridHistoryIcon)
export const GridChartsIcon = createMuiNode(MuiGridChartsIcon)
export const GridSyncIcon = createMuiNode(MuiGridSyncIcon)
export const GridSyncDisabledIcon = createMuiNode(MuiGridSyncDisabledIcon)

// Toolbar components
export const Toolbar = createMuiNode(MuiToolbar)
export const ToolbarButton = createMuiNode(MuiToolbarButton)

// Prompt field components
export const PromptField = createMuiNode(MuiPromptField)
export const PromptFieldControl = createMuiNode(MuiPromptFieldControl)
export const PromptFieldRecord = createMuiNode(MuiPromptFieldRecord)
export const PromptFieldSend = createMuiNode(MuiPromptFieldSend)

// Quick filter components
export const QuickFilter = createMuiNode(MuiQuickFilter)
export const QuickFilterClear = createMuiNode(MuiQuickFilterClear)
export const QuickFilterControl = createMuiNode(MuiQuickFilterControl)
export const QuickFilterTrigger = createMuiNode(MuiQuickFilterTrigger)

// Pagination components
export const GridPagination = createMuiNode(MuiGridPagination)
