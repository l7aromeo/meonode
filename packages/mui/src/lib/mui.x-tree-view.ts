import createMuiNode from '@src/core'
import {
  RichTreeViewRoot as MuiRichTreeViewRoot,
  SimpleTreeViewRoot as MuiSimpleTreeViewRoot,
  TreeItem as MuiTreeItem,
  TreeItemContent as MuiTreeItemContent,
  TreeItemCheckbox as MuiTreeItemCheckbox,
  TreeItemDragAndDropOverlay as MuiTreeItemDragAndDropOverlay,
  TreeItemGroupTransition as MuiTreeItemGroupTransition,
  TreeItemIconContainer as MuiTreeItemIconContainer,
  TreeItemLabel as MuiTreeItemLabel,
  TreeItemLabelInput as MuiTreeItemLabelInput,
  TreeItemProvider as MuiTreeItemProvider,
  TreeItemRoot as MuiTreeItemRoot,
  TreeItemIcon as MuiTreeItemIcon,
  TreeViewExpandIcon as MuiTreeViewExpandIcon,
  TreeViewCollapseIcon as MuiTreeViewCollapseIcon,
} from '@mui/x-tree-view'

/**
 * Export Material-UI X Tree View component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */
export const RichTreeViewRoot = createMuiNode(MuiRichTreeViewRoot)
export const SimpleTreeViewRoot = createMuiNode(MuiSimpleTreeViewRoot)

export const TreeItem = createMuiNode(MuiTreeItem)
export const TreeItemContent = createMuiNode(MuiTreeItemContent)
export const TreeItemCheckbox = createMuiNode(MuiTreeItemCheckbox)
export const TreeItemDragAndDropOverlay = createMuiNode(MuiTreeItemDragAndDropOverlay)
export const TreeItemGroupTransition = createMuiNode(MuiTreeItemGroupTransition)
export const TreeItemIconContainer = createMuiNode(MuiTreeItemIconContainer)
export const TreeItemLabel = createMuiNode(MuiTreeItemLabel)
export const TreeItemLabelInput = createMuiNode(MuiTreeItemLabelInput)
export const TreeItemProvider = createMuiNode(MuiTreeItemProvider)
export const TreeItemRoot = createMuiNode(MuiTreeItemRoot)

export const TreeItemIcon = createMuiNode(MuiTreeItemIcon)
export const TreeViewExpandIcon = createMuiNode(MuiTreeViewExpandIcon)
export const TreeViewCollapseIcon = createMuiNode(MuiTreeViewCollapseIcon)
