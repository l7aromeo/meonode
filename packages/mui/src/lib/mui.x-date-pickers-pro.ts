import React from 'react'
import createMuiNode from '@src/core.js'
import {
  DateCalendar as MuiDateCalendar,
  DateField as MuiDateField,
  DatePicker as MuiDatePicker,
  DatePickerToolbar as MuiDatePickerToolbar,
  DateRangeCalendar as MuiDateRangeCalendar,
  DateRangePicker as MuiDateRangePicker,
  DateRangePickerDay as MuiDateRangePickerDay,
  DateRangePickerDay2 as MuiDateRangePickerDay2,
  DateRangePickerToolbar as MuiDateRangePickerToolbar,
  DateTimeField as MuiDateTimeField,
  DateTimePicker as MuiDateTimePicker,
  DateTimePickerTabs as MuiDateTimePickerTabs,
  DateTimePickerToolbar as MuiDateTimePickerToolbar,
  DateTimeRangePicker as MuiDateTimeRangePicker,
  DateTimeRangePickerTabs as MuiDateTimeRangePickerTabs,
  DateTimeRangePickerToolbar as MuiDateTimeRangePickerToolbar,
  DayCalendarSkeleton as MuiDayCalendarSkeleton,
  DesktopDatePicker as MuiDesktopDatePicker,
  DesktopDateRangePicker as MuiDesktopDateRangePicker,
  DesktopDateTimePicker as MuiDesktopDateTimePicker,
  DesktopDateTimePickerLayout as MuiDesktopDateTimePickerLayout,
  DesktopDateTimeRangePicker as MuiDesktopDateTimeRangePicker,
  DesktopTimePicker as MuiDesktopTimePicker,
  DesktopTimeRangePicker as MuiDesktopTimeRangePicker,
  DigitalClock as MuiDigitalClock,
  DigitalClockItem as MuiDigitalClockItem,
  LocalizationProvider as MuiLocalizationProvider,
  MobileDatePicker as MuiMobileDatePicker,
  MobileDateRangePicker as MuiMobileDateRangePicker,
  MobileDateTimePicker as MuiMobileDateTimePicker,
  MobileDateTimeRangePicker as MuiMobileDateTimeRangePicker,
  MobileTimePicker as MuiMobileTimePicker,
  MobileTimeRangePicker as MuiMobileTimeRangePicker,
  MonthCalendar as MuiMonthCalendar,
  MultiInputDateRangeField as MuiMultiInputDateRangeField,
  MultiInputDateTimeRangeField as MuiMultiInputDateTimeRangeField,
  MultiInputTimeRangeField as MuiMultiInputTimeRangeField,
  MultiSectionDigitalClock as MuiMultiSectionDigitalClock,
  PickerDay2 as MuiPickerDay2,
  PickersActionBar as MuiPickersActionBar,
  PickersActionBarProps,
  PickersCalendarHeader as MuiPickersCalendarHeader,
  PickersDay as MuiPickersDay,
  PickersLayout as MuiPickersLayout,
  PickersLayoutContentWrapper as MuiPickersLayoutContentWrapper,
  PickersLayoutRoot as MuiPickersLayoutRoot,
  PickersRangeCalendarHeader as MuiPickersRangeCalendarHeader,
  PickersShortcuts as MuiPickersShortcuts,
  PickersTextField as MuiPickersTextField,
  SingleInputDateRangeField as MuiSingleInputDateRangeField,
  SingleInputDateTimeRangeField as MuiSingleInputDateTimeRangeField,
  SingleInputTimeRangeField as MuiSingleInputTimeRangeField,
  StaticDatePicker as MuiStaticDatePicker,
  StaticDateRangePicker as MuiStaticDateRangePicker,
  StaticDateTimePicker as MuiStaticDateTimePicker,
  StaticTimePicker as MuiStaticTimePicker,
  TimeClock as MuiTimeClock,
  TimeField as MuiTimeField,
  TimePicker as MuiTimePicker,
  TimePickerToolbar as MuiTimePickerToolbar,
  TimeRangePicker as MuiTimeRangePicker,
  TimeRangePickerTabs as MuiTimeRangePickerTabs,
  TimeRangePickerToolbar as MuiTimeRangePickerToolbar,
  YearCalendar as MuiYearCalendar,
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

export const DateCalendar = createMuiNode(MuiDateCalendar)
export const DateRangeCalendar = createMuiNode(MuiDateRangeCalendar)
export const DayCalendarSkeleton = createMuiNode(MuiDayCalendarSkeleton)
export const MonthCalendar = createMuiNode(MuiMonthCalendar)
export const YearCalendar = createMuiNode(MuiYearCalendar)

export const DateField = createMuiNode(MuiDateField)
export const DateTimeField = createMuiNode(MuiDateTimeField)
export const MultiInputDateRangeField = createMuiNode(MuiMultiInputDateRangeField)
export const MultiInputDateTimeRangeField = createMuiNode(MuiMultiInputDateTimeRangeField)
export const MultiInputTimeRangeField = createMuiNode(MuiMultiInputTimeRangeField)
export const SingleInputDateRangeField = createMuiNode(MuiSingleInputDateRangeField)
export const SingleInputDateTimeRangeField = createMuiNode(MuiSingleInputDateTimeRangeField)
export const SingleInputTimeRangeField = createMuiNode(MuiSingleInputTimeRangeField)
export const TimeField = createMuiNode(MuiTimeField)

export const DatePicker = createMuiNode(MuiDatePicker)
export const DatePickerToolbar = createMuiNode(MuiDatePickerToolbar)
export const DateRangePicker = createMuiNode(MuiDateRangePicker)
export const DateRangePickerDay = createMuiNode(MuiDateRangePickerDay)
export const DateRangePickerDay2 = createMuiNode(MuiDateRangePickerDay2)
export const DateRangePickerToolbar = createMuiNode(MuiDateRangePickerToolbar)
export const DesktopDatePicker = createMuiNode(MuiDesktopDatePicker)
export const DesktopDateRangePicker = createMuiNode(MuiDesktopDateRangePicker)
export const MobileDatePicker = createMuiNode(MuiMobileDatePicker)
export const MobileDateRangePicker = createMuiNode(MuiMobileDateRangePicker)
export const StaticDatePicker = createMuiNode(MuiStaticDatePicker)
export const StaticDateRangePicker = createMuiNode(MuiStaticDateRangePicker)

export const DateTimePicker = createMuiNode(MuiDateTimePicker)
export const DateTimePickerTabs = createMuiNode(MuiDateTimePickerTabs)
export const DateTimePickerToolbar = createMuiNode(MuiDateTimePickerToolbar)
export const DateTimeRangePicker = createMuiNode(MuiDateTimeRangePicker)
export const DateTimeRangePickerTabs = createMuiNode(MuiDateTimeRangePickerTabs)
export const DateTimeRangePickerToolbar = createMuiNode(MuiDateTimeRangePickerToolbar)
export const DesktopDateTimePicker = createMuiNode(MuiDesktopDateTimePicker)
export const DesktopDateTimePickerLayout = createMuiNode(MuiDesktopDateTimePickerLayout)
export const DesktopDateTimeRangePicker = createMuiNode(MuiDesktopDateTimeRangePicker)
export const MobileDateTimePicker = createMuiNode(MuiMobileDateTimePicker)
export const MobileDateTimeRangePicker = createMuiNode(MuiMobileDateTimeRangePicker)
export const StaticDateTimePicker = createMuiNode(MuiStaticDateTimePicker)

export const DesktopTimePicker = createMuiNode(MuiDesktopTimePicker)
export const DesktopTimeRangePicker = createMuiNode(MuiDesktopTimeRangePicker)
export const DigitalClock = createMuiNode(MuiDigitalClock)
export const DigitalClockItem = createMuiNode(MuiDigitalClockItem)
export const MobileTimePicker = createMuiNode(MuiMobileTimePicker)
export const MobileTimeRangePicker = createMuiNode(MuiMobileTimeRangePicker)
export const MultiSectionDigitalClock = createMuiNode(MuiMultiSectionDigitalClock)
export const StaticTimePicker = createMuiNode(MuiStaticTimePicker)
export const TimeClock = createMuiNode(MuiTimeClock)
export const TimePicker = createMuiNode(MuiTimePicker)
export const TimePickerToolbar = createMuiNode(MuiTimePickerToolbar)
export const TimeRangePicker = createMuiNode(MuiTimeRangePicker)
export const TimeRangePickerTabs = createMuiNode(MuiTimeRangePickerTabs)
export const TimeRangePickerToolbar = createMuiNode(MuiTimeRangePickerToolbar)

export const PickerDay2 = createMuiNode(MuiPickerDay2)
export const PickersActionBar = createMuiNode(MuiPickersActionBar as React.ComponentType<PickersActionBarProps>)
export const PickersCalendarHeader = createMuiNode(MuiPickersCalendarHeader)
export const PickersDay = createMuiNode(MuiPickersDay)
export const PickersLayout = createMuiNode(MuiPickersLayout)
export const PickersLayoutContentWrapper = createMuiNode(MuiPickersLayoutContentWrapper)
export const PickersLayoutRoot = createMuiNode(MuiPickersLayoutRoot)
export const PickersRangeCalendarHeader = createMuiNode(MuiPickersRangeCalendarHeader)
export const PickersShortcuts = createMuiNode(MuiPickersShortcuts)
export const PickersTextField = createMuiNode(MuiPickersTextField)
