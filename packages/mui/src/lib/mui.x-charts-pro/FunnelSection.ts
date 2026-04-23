import { createMuiNode, type WrappedMui } from '@src/core.js'
import { FunnelSection as MuiFunnelSection } from '@mui/x-charts-pro'

const FunnelSection: WrappedMui<typeof MuiFunnelSection> = createMuiNode(MuiFunnelSection)
export default FunnelSection
