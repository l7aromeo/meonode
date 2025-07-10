import createMuiNode from '@src/core'
import * as MuiDatePickers from '@mui/x-date-pickers'

/**
 * Export Material-UI X Date Pickers component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */

export const TimeField = createMuiNode(MuiDatePickers.TimeField)
export const TimePicker = createMuiNode(MuiDatePickers.TimePicker)
export const TimePickerToolbar = createMuiNode(MuiDatePickers.TimePickerToolbar)
export const DesktopTimePicker = createMuiNode(MuiDatePickers.DesktopTimePicker)

export const DatePickers = createMuiNode(MuiDatePickers.DatePicker)
export const DatePickerToolbar = createMuiNode(MuiDatePickers.DatePickerToolbar)
export const DesktopDatePicker = createMuiNode(MuiDatePickers.DesktopDatePicker)

export const DateTimePicker = createMuiNode(MuiDatePickers.DateTimePicker)
export const DateTimePickerTabs = createMuiNode(MuiDatePickers.DateTimePickerTabs)
export const DateTimePickerToolbar = createMuiNode(MuiDatePickers.DateTimePickerToolbar)
export const DesktopDateTimePicker = createMuiNode(MuiDatePickers.DesktopDateTimePicker)
export const DesktopDateTimePickerLayout = createMuiNode(MuiDatePickers.DesktopDateTimePickerLayout)
