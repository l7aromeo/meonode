import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridToolbarDensitySelector as MuiGridToolbarDensitySelector } from '@mui/x-data-grid-pro'

const GridToolbarDensitySelector: WrappedMui<typeof MuiGridToolbarDensitySelector> = createMuiNode(MuiGridToolbarDensitySelector)
export default GridToolbarDensitySelector
