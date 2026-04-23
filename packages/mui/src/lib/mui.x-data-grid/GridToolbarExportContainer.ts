import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridToolbarExportContainer as MuiGridToolbarExportContainer } from '@mui/x-data-grid'

const GridToolbarExportContainer: WrappedMui<typeof MuiGridToolbarExportContainer> = createMuiNode(MuiGridToolbarExportContainer)
export default GridToolbarExportContainer
