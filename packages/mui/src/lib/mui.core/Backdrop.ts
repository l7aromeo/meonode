import { createMuiNode, type WrappedMui } from '@src/core.js'
import { Backdrop as MuiBackdrop } from '@mui/material'

const Backdrop: WrappedMui<typeof MuiBackdrop> = createMuiNode(MuiBackdrop)
export default Backdrop
