import { createMuiNode, type WrappedMui } from '@src/core.js'
import { PieArcLabel as MuiPieArcLabel } from '@mui/x-charts-pro'

const PieArcLabel: WrappedMui<typeof MuiPieArcLabel> = createMuiNode(MuiPieArcLabel)
export default PieArcLabel
