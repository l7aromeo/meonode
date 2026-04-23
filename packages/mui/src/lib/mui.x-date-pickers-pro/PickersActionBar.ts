import { createMuiNode, type WrappedMui } from '@src/core.js'
import { PickersActionBar as MuiPickersActionBar } from '@mui/x-date-pickers-pro'

const PickersActionBar: WrappedMui<typeof MuiPickersActionBar> = createMuiNode(MuiPickersActionBar)
export default PickersActionBar
