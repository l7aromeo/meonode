import createMuiNode from '@src/core.js'
import {
  Timeline as MuiTimeline,
  TimelineConnector as MuiTimelineConnector,
  TimelineContent as MuiTimelineContent,
  TimelineDot as MuiTimelineDot,
  TimelineItem as MuiTimelineItem,
  TimelineOppositeContent as MuiTimelineOppositeContent,
  TimelineSeparator as MuiTimelineSeparator,
  Masonry as MuiMasonry,
  TabContext as MuiTabContext,
  TabList as MuiTabList,
  TabPanel as MuiTabPanel,
} from '@mui/lab'
import React from 'react'
import { TabListProps } from '@src/lib/mui.lab.type.js'

/**
 * Export Material-UI Lab component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */
export const Timeline = createMuiNode(MuiTimeline)
export const TimelineConnector = createMuiNode(MuiTimelineConnector)
export const TimelineContent = createMuiNode(MuiTimelineContent)
export const TimelineDot = createMuiNode(MuiTimelineDot)
export const TimelineItem = createMuiNode(MuiTimelineItem)
export const TimelineOppositeContent = createMuiNode(MuiTimelineOppositeContent)
export const TimelineSeparator = createMuiNode(MuiTimelineSeparator)
export const Masonry = createMuiNode(MuiMasonry)
export const TabContext = createMuiNode(MuiTabContext)
export const TabList = createMuiNode(MuiTabList as React.ComponentType<TabListProps>)
export const TabPanel = createMuiNode(MuiTabPanel)
