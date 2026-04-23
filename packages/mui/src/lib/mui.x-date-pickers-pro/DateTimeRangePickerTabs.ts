import { createMuiNode, type WrappedMui } from '@src/core.js'
import { DateTimeRangePickerTabs as MuiDateTimeRangePickerTabs } from '@mui/x-date-pickers-pro'

const DateTimeRangePickerTabs: WrappedMui<typeof MuiDateTimeRangePickerTabs> = createMuiNode(MuiDateTimeRangePickerTabs)
export default DateTimeRangePickerTabs
