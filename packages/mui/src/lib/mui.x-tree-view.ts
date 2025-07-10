import createMuiNode from '@src/core'
import * as MuiTreeView from '@mui/x-tree-view'

/**
 * Export Material-UI X Tree View component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */
export const RichTreeViewRoot = createMuiNode(MuiTreeView.RichTreeViewRoot)
export const SimpleTreeViewRoot = createMuiNode(MuiTreeView.SimpleTreeViewRoot)

export const TreeItem = createMuiNode(MuiTreeView.TreeItem)
export const TreeItemContent = createMuiNode(MuiTreeView.TreeItemContent)
export const TreeItemCheckbox = createMuiNode(MuiTreeView.TreeItemCheckbox)
export const TreeItemDragAndDropOverlay = createMuiNode(MuiTreeView.TreeItemDragAndDropOverlay)
export const TreeItemGroupTransition = createMuiNode(MuiTreeView.TreeItemGroupTransition)
export const TreeItemIconContainer = createMuiNode(MuiTreeView.TreeItemIconContainer)
export const TreeItemLabel = createMuiNode(MuiTreeView.TreeItemLabel)
export const TreeItemLabelInput = createMuiNode(MuiTreeView.TreeItemLabelInput)
export const TreeItemProvider = createMuiNode(MuiTreeView.TreeItemProvider)
export const TreeItemRoot = createMuiNode(MuiTreeView.TreeItemRoot)

export const TreeItemIcon = createMuiNode(MuiTreeView.TreeItemIcon)
export const TreeViewExpandIcon = createMuiNode(MuiTreeView.TreeViewExpandIcon)
export const TreeViewCollapseIcon = createMuiNode(MuiTreeView.TreeViewCollapseIcon)
