import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridBooleanCell as MuiGridBooleanCell } from '@mui/x-data-grid-pro'

const GridBooleanCell: WrappedMui<typeof MuiGridBooleanCell> = createMuiNode(MuiGridBooleanCell)
export default GridBooleanCell
