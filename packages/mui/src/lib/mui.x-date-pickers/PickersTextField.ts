import { createMuiNode, type WrappedMui } from '@src/core.js'
import { PickersTextField as MuiPickersTextField } from '@mui/x-date-pickers'

const PickersTextField: WrappedMui<typeof MuiPickersTextField> = createMuiNode(MuiPickersTextField)
export default PickersTextField
