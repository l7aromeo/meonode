import { createMuiNode, type WrappedMui } from '@src/core.js'
import { TimeRangePickerTabs as MuiTimeRangePickerTabs } from '@mui/x-date-pickers-pro'

const TimeRangePickerTabs: WrappedMui<typeof MuiTimeRangePickerTabs> = createMuiNode(MuiTimeRangePickerTabs)
export default TimeRangePickerTabs
