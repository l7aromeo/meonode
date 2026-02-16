import createMuiNode from '@src/core.js'
import {
  RichTreeViewPro as MuiRichTreeViewPro,
  RichTreeViewProRoot as MuiRichTreeViewProRoot,
  SimpleTreeView as MuiSimpleTreeView,
  SimpleTreeViewRoot as MuiSimpleTreeViewRoot,
  TreeItem as MuiTreeItem,
  TreeItemCheckbox as MuiTreeItemCheckbox,
  TreeItemContent as MuiTreeItemContent,
  TreeItemDragAndDropOverlay as MuiTreeItemDragAndDropOverlay,
  TreeItemGroupTransition as MuiTreeItemGroupTransition,
  TreeItemIcon as MuiTreeItemIcon,
  TreeItemIconContainer as MuiTreeItemIconContainer,
  TreeItemLabel as MuiTreeItemLabel,
  TreeItemLabelInput as MuiTreeItemLabelInput,
  TreeItemProvider as MuiTreeItemProvider,
  TreeItemRoot as MuiTreeItemRoot,
  TreeViewCollapseIcon as MuiTreeViewCollapseIcon,
  TreeViewExpandIcon as MuiTreeViewExpandIcon,
} from '@mui/x-tree-view-pro'

/**
 * Export Material-UI X Tree View component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */

export const RichTreeViewPro = createMuiNode(MuiRichTreeViewPro)
export const RichTreeViewProRoot = createMuiNode(MuiRichTreeViewProRoot)
export const SimpleTreeView = createMuiNode(MuiSimpleTreeView)
export const SimpleTreeViewRoot = createMuiNode(MuiSimpleTreeViewRoot)

export const TreeItem = createMuiNode(MuiTreeItem)
export const TreeItemCheckbox = createMuiNode(MuiTreeItemCheckbox)
export const TreeItemContent = createMuiNode(MuiTreeItemContent)
export const TreeItemDragAndDropOverlay = createMuiNode(MuiTreeItemDragAndDropOverlay)
export const TreeItemGroupTransition = createMuiNode(MuiTreeItemGroupTransition)
export const TreeItemIcon = createMuiNode(MuiTreeItemIcon)
export const TreeItemIconContainer = createMuiNode(MuiTreeItemIconContainer)
export const TreeItemLabel = createMuiNode(MuiTreeItemLabel)
export const TreeItemLabelInput = createMuiNode(MuiTreeItemLabelInput)
export const TreeItemProvider = createMuiNode(MuiTreeItemProvider)
export const TreeItemRoot = createMuiNode(MuiTreeItemRoot)

export const TreeViewCollapseIcon = createMuiNode(MuiTreeViewCollapseIcon)
export const TreeViewExpandIcon = createMuiNode(MuiTreeViewExpandIcon)
