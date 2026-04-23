import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridColumnHeaderSortIcon as MuiGridColumnHeaderSortIcon } from '@mui/x-data-grid'

const GridColumnHeaderSortIcon: WrappedMui<typeof MuiGridColumnHeaderSortIcon> = createMuiNode(MuiGridColumnHeaderSortIcon)
export default GridColumnHeaderSortIcon
