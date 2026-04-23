import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridRowCount as MuiGridRowCount } from '@mui/x-data-grid-premium'

const GridRowCount: WrappedMui<typeof MuiGridRowCount> = createMuiNode(MuiGridRowCount)
export default GridRowCount
