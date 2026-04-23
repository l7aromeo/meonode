import { createMuiNode, type WrappedMui } from '@src/core.js'
import { DataGridPro as MuiDataGridPro } from '@mui/x-data-grid-pro'

const DataGridPro: WrappedMui<typeof MuiDataGridPro> = createMuiNode(MuiDataGridPro)
export default DataGridPro
