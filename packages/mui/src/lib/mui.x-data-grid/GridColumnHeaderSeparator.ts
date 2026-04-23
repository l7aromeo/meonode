import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridColumnHeaderSeparator as MuiGridColumnHeaderSeparator } from '@mui/x-data-grid'

const GridColumnHeaderSeparator: WrappedMui<typeof MuiGridColumnHeaderSeparator> = createMuiNode(MuiGridColumnHeaderSeparator)
export default GridColumnHeaderSeparator
