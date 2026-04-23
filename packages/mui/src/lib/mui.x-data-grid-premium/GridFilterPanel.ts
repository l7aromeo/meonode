import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridFilterPanel as MuiGridFilterPanel } from '@mui/x-data-grid-premium'

const GridFilterPanel: WrappedMui<typeof MuiGridFilterPanel> = createMuiNode(MuiGridFilterPanel)
export default GridFilterPanel
