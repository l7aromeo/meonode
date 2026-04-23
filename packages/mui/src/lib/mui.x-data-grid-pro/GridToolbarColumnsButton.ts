import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridToolbarColumnsButton as MuiGridToolbarColumnsButton } from '@mui/x-data-grid-pro'

const GridToolbarColumnsButton: WrappedMui<typeof MuiGridToolbarColumnsButton> = createMuiNode(MuiGridToolbarColumnsButton)
export default GridToolbarColumnsButton
