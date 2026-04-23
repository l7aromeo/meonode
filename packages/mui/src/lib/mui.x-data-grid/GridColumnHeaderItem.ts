import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridColumnHeaderItem as MuiGridColumnHeaderItem } from '@mui/x-data-grid'

const GridColumnHeaderItem: WrappedMui<typeof MuiGridColumnHeaderItem> = createMuiNode(MuiGridColumnHeaderItem)
export default GridColumnHeaderItem
