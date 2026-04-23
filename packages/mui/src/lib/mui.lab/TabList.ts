import { createMuiNode, type WrappedMui } from '@src/core.js'
import { TabList as MuiTabList } from '@mui/lab'

const TabList: WrappedMui<typeof MuiTabList> = createMuiNode(MuiTabList)
export default TabList
