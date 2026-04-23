import { createMuiNode, type WrappedMui } from '@src/core.js'
import { PromptField as MuiPromptField } from '@mui/x-data-grid-premium'

const PromptField: WrappedMui<typeof MuiPromptField> = createMuiNode(MuiPromptField)
export default PromptField
