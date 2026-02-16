import React from 'react'
import createMuiNode from '@src/core.js'
import {
  DateCalendar as MuiDateCalendar,
  DateField as MuiDateField,
  DatePicker as MuiDatePicker,
  DatePickerToolbar as MuiDatePickerToolbar,
  DateTimeField as MuiDateTimeField,
  DateTimePicker as MuiDateTimePicker,
  DateTimePickerTabs as MuiDateTimePickerTabs,
  DateTimePickerToolbar as MuiDateTimePickerToolbar,
  DayCalendarSkeleton as MuiDayCalendarSkeleton,
  DesktopDatePicker as MuiDesktopDatePicker,
  DesktopDateTimePicker as MuiDesktopDateTimePicker,
  DesktopDateTimePickerLayout as MuiDesktopDateTimePickerLayout,
  DesktopTimePicker as MuiDesktopTimePicker,
  DigitalClock as MuiDigitalClock,
  DigitalClockItem as MuiDigitalClockItem,
  LocalizationProvider as MuiLocalizationProvider,
  MobileDatePicker as MuiMobileDatePicker,
  MobileDateTimePicker as MuiMobileDateTimePicker,
  MobileTimePicker as MuiMobileTimePicker,
  MonthCalendar as MuiMonthCalendar,
  MultiSectionDigitalClock as MuiMultiSectionDigitalClock,
  PickerDay2 as MuiPickerDay2,
  PickersActionBar as MuiPickersActionBar,
  PickersActionBarProps,
  PickersCalendarHeader as MuiPickersCalendarHeader,
  PickersDay as MuiPickersDay,
  PickersLayout as MuiPickersLayout,
  PickersLayoutContentWrapper as MuiPickersLayoutContentWrapper,
  PickersLayoutRoot as MuiPickersLayoutRoot,
  PickersShortcuts as MuiPickersShortcuts,
  PickersTextField as MuiPickersTextField,
  StaticDatePicker as MuiStaticDatePicker,
  StaticDateTimePicker as MuiStaticDateTimePicker,
  StaticTimePicker as MuiStaticTimePicker,
  TimeClock as MuiTimeClock,
  TimeField as MuiTimeField,
  TimePicker as MuiTimePicker,
  TimePickerToolbar as MuiTimePickerToolbar,
  YearCalendar as MuiYearCalendar,
} from '@mui/x-date-pickers'

/**
 * Export Material-UI X Date Pickers component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */

export const LocalizationProvider = createMuiNode(MuiLocalizationProvider)

export const DateCalendar = createMuiNode(MuiDateCalendar)
export const DayCalendarSkeleton = createMuiNode(MuiDayCalendarSkeleton)
export const MonthCalendar = createMuiNode(MuiMonthCalendar)
export const YearCalendar = createMuiNode(MuiYearCalendar)

export const DateField = createMuiNode(MuiDateField)
export const DateTimeField = createMuiNode(MuiDateTimeField)
export const TimeField = createMuiNode(MuiTimeField)

export const DatePicker = createMuiNode(MuiDatePicker)
export const DatePickerToolbar = createMuiNode(MuiDatePickerToolbar)
export const DesktopDatePicker = createMuiNode(MuiDesktopDatePicker)
export const MobileDatePicker = createMuiNode(MuiMobileDatePicker)
export const StaticDatePicker = createMuiNode(MuiStaticDatePicker)

export const DateTimePicker = createMuiNode(MuiDateTimePicker)
export const DateTimePickerTabs = createMuiNode(MuiDateTimePickerTabs)
export const DateTimePickerToolbar = createMuiNode(MuiDateTimePickerToolbar)
export const DesktopDateTimePicker = createMuiNode(MuiDesktopDateTimePicker)
export const DesktopDateTimePickerLayout = createMuiNode(MuiDesktopDateTimePickerLayout)
export const MobileDateTimePicker = createMuiNode(MuiMobileDateTimePicker)
export const StaticDateTimePicker = createMuiNode(MuiStaticDateTimePicker)

export const DesktopTimePicker = createMuiNode(MuiDesktopTimePicker)
export const DigitalClock = createMuiNode(MuiDigitalClock)
export const DigitalClockItem = createMuiNode(MuiDigitalClockItem)
export const MobileTimePicker = createMuiNode(MuiMobileTimePicker)
export const MultiSectionDigitalClock = createMuiNode(MuiMultiSectionDigitalClock)
export const StaticTimePicker = createMuiNode(MuiStaticTimePicker)
export const TimeClock = createMuiNode(MuiTimeClock)
export const TimePicker = createMuiNode(MuiTimePicker)
export const TimePickerToolbar = createMuiNode(MuiTimePickerToolbar)

export const PickerDay2 = createMuiNode(MuiPickerDay2)
export const PickersActionBar = createMuiNode(MuiPickersActionBar as React.ComponentType<PickersActionBarProps>)
export const PickersCalendarHeader = createMuiNode(MuiPickersCalendarHeader)
export const PickersDay = createMuiNode(MuiPickersDay)
export const PickersLayout = createMuiNode(MuiPickersLayout)
export const PickersLayoutContentWrapper = createMuiNode(MuiPickersLayoutContentWrapper)
export const PickersLayoutRoot = createMuiNode(MuiPickersLayoutRoot)
export const PickersShortcuts = createMuiNode(MuiPickersShortcuts)
export const PickersTextField = createMuiNode(MuiPickersTextField)
