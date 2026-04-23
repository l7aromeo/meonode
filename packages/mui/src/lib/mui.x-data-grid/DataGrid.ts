import { createMuiNode, type WrappedMui } from '@src/core.js'
import { DataGrid as MuiDataGrid } from '@mui/x-data-grid'

const DataGrid: WrappedMui<typeof MuiDataGrid> = createMuiNode(MuiDataGrid)
export default DataGrid
