import { createMuiNode, type WrappedMui } from '@src/core.js'
import { PickersTextField as MuiPickersTextField } from '@mui/x-date-pickers-pro'

const PickersTextField: WrappedMui<typeof MuiPickersTextField> = createMuiNode(MuiPickersTextField)
export default PickersTextField
