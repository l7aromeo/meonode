import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridToolbarDensitySelector as MuiGridToolbarDensitySelector } from '@mui/x-data-grid-premium'

const GridToolbarDensitySelector: WrappedMui<typeof MuiGridToolbarDensitySelector> = createMuiNode(MuiGridToolbarDensitySelector)
export default GridToolbarDensitySelector
