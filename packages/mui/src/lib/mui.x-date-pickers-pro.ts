import createMuiNode from '@src/core'
import {
  LocalizationProvider as MuiLocalizationProvider,
  TimeField as MuiTimeField,
  TimePicker as MuiTimePicker,
  TimePickerToolbar as MuiTimePickerToolbar,
  DesktopTimePicker as MuiDesktopTimePicker,
  DatePicker as MuiDatePicker,
  DatePickerToolbar as MuiDatePickerToolbar,
  DesktopDatePicker as MuiDesktopDatePicker,
  DateTimePicker as MuiDateTimePicker,
  DateTimePickerTabs as MuiDateTimePickerTabs,
  DateTimePickerToolbar as MuiDateTimePickerToolbar,
  DesktopDateTimePicker as MuiDesktopDateTimePicker,
  DesktopDateTimePickerLayout as MuiDesktopDateTimePickerLayout,
} from '@mui/x-date-pickers-pro'

/**
 * Export Material-UI X Date Pickers component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */

export const LocalizationProvider = createMuiNode(MuiLocalizationProvider)
export const TimeField = createMuiNode(MuiTimeField)
export const TimePicker = createMuiNode(MuiTimePicker)
export const TimePickerToolbar = createMuiNode(MuiTimePickerToolbar)
export const DesktopTimePicker = createMuiNode(MuiDesktopTimePicker)

export const DatePicker = createMuiNode(MuiDatePicker)
export const DatePickerToolbar = createMuiNode(MuiDatePickerToolbar)
export const DesktopDatePicker = createMuiNode(MuiDesktopDatePicker)

export const DateTimePicker = createMuiNode(MuiDateTimePicker)
export const DateTimePickerTabs = createMuiNode(MuiDateTimePickerTabs)
export const DateTimePickerToolbar = createMuiNode(MuiDateTimePickerToolbar)
export const DesktopDateTimePicker = createMuiNode(MuiDesktopDateTimePicker)
export const DesktopDateTimePickerLayout = createMuiNode(MuiDesktopDateTimePickerLayout)
