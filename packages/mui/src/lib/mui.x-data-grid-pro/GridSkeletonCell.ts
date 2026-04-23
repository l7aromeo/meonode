import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridSkeletonCell as MuiGridSkeletonCell } from '@mui/x-data-grid-pro'

const GridSkeletonCell: WrappedMui<typeof MuiGridSkeletonCell> = createMuiNode(MuiGridSkeletonCell)
export default GridSkeletonCell
