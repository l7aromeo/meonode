import { createMuiNode, type WrappedMui } from '@src/core.js'
import { Slider as MuiSlider } from '@mui/material'

const Slider: WrappedMui<typeof MuiSlider> = createMuiNode(MuiSlider)
export default Slider
