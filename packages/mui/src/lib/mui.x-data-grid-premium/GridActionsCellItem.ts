import { createMuiNode, type WrappedMui } from '@src/core.js'
import { GridActionsCellItem as MuiGridActionsCellItem } from '@mui/x-data-grid-premium'

const GridActionsCellItem: WrappedMui<typeof MuiGridActionsCellItem> = createMuiNode(MuiGridActionsCellItem)
export default GridActionsCellItem
