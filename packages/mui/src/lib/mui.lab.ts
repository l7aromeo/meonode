import createMuiNode from '@src/core'
import * as MuiLab from '@mui/lab'

/**
 * Export Material-UI Lab component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */
export const Timeline = createMuiNode(MuiLab.Timeline)
export const TimelineConnector = createMuiNode(MuiLab.TimelineConnector)
export const TimelineContent = createMuiNode(MuiLab.TimelineContent)
export const TimelineDot = createMuiNode(MuiLab.TimelineDot)
export const TimelineItem = createMuiNode(MuiLab.TimelineItem)
export const TimelineOppositeContent = createMuiNode(MuiLab.TimelineOppositeContent)
export const TimelineSeparator = createMuiNode(MuiLab.TimelineSeparator)
export const Masonry = createMuiNode(MuiLab.Masonry)
export const TabContext = createMuiNode(MuiLab.TabContext)
export const TabList = createMuiNode<typeof MuiLab.TabList>(MuiLab.TabList)
export const TabPanel = createMuiNode(MuiLab.TabPanel)
