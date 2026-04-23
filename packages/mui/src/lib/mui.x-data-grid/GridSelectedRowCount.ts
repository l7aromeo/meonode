import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridSelectedRowCount as MuiGridSelectedRowCount } from '@mui/x-data-grid'

const GridSelectedRowCount: WrappedMui<typeof MuiGridSelectedRowCount> = createMuiNode(MuiGridSelectedRowCount)
export default GridSelectedRowCount
