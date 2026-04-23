import { createMuiNode, type WrappedMui } from '@src/core.js'
import { ChartsContainerPro as MuiChartsContainerPro } from '@mui/x-charts-pro'

const ChartsContainerPro: WrappedMui<typeof MuiChartsContainerPro> = createMuiNode(MuiChartsContainerPro)
export default ChartsContainerPro
