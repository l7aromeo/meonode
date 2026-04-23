import { createMuiNode, type WrappedMui } from '@src/core.js'
import { DataGridPremium as MuiDataGridPremium } from '@mui/x-data-grid-premium'

const DataGridPremium: WrappedMui<typeof MuiDataGridPremium> = createMuiNode(MuiDataGridPremium)
export default DataGridPremium
