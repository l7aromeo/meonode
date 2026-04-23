import { createMuiNode, type WrappedMui } from '@src/core.js'
import { FunnelSectionLabel as MuiFunnelSectionLabel } from '@mui/x-charts-pro'

const FunnelSectionLabel: WrappedMui<typeof MuiFunnelSectionLabel> = createMuiNode(MuiFunnelSectionLabel)
export default FunnelSectionLabel
