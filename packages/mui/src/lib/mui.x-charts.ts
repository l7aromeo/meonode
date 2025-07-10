import React from 'react'
import createMuiNode from '@src/core'
import * as MuiCharts from '@mui/x-charts'
import { PieArcLabelProps, PieArcProps } from '@mui/x-charts'

/**
 * Export Material-UI X Charts component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */

export const ChartsAxis = createMuiNode(MuiCharts.ChartsAxis)
export const ChartsXAxis = createMuiNode(MuiCharts.ChartsXAxis)
export const ChartsYAxis = createMuiNode(MuiCharts.ChartsYAxis)
export const ChartsAxisHighlight = createMuiNode(MuiCharts.ChartsAxisHighlight)
export const ChartsAxisHighlightPath = createMuiNode(MuiCharts.ChartsAxisHighlightPath)
export const ChartsClipPath = createMuiNode(MuiCharts.ChartsClipPath)
export const ChartsGrid = createMuiNode(MuiCharts.ChartsGrid)
export const ChartsItemTooltipContent = createMuiNode(MuiCharts.ChartsItemTooltipContent)
export const ChartsLocalizationProvider = createMuiNode(MuiCharts.ChartsLocalizationProvider)
export const ChartsLabelMark = createMuiNode(MuiCharts.ChartsLabelMark)
export const ChartsLegend = createMuiNode(MuiCharts.ChartsLegend)
export const ChartsReferenceLine = createMuiNode(MuiCharts.ChartsReferenceLine)
export const ChartsSurface = createMuiNode(MuiCharts.ChartsSurface)
export const ChartsText = createMuiNode(MuiCharts.ChartsText)
export const ChartsTooltip = createMuiNode(MuiCharts.ChartsTooltip)
export const ChartsTooltipContainer = createMuiNode(MuiCharts.ChartsTooltipContainer)
export const ChartsTooltipPaper = createMuiNode(MuiCharts.ChartsTooltipPaper)
export const ChartsTooltipTable = createMuiNode(MuiCharts.ChartsTooltipTable)
export const ChartsTooltipCell = createMuiNode(MuiCharts.ChartsTooltipCell)
export const ChartsTooltipRow = createMuiNode(MuiCharts.ChartsTooltipRow)

export const AnimatedArea = createMuiNode(MuiCharts.AnimatedArea)
export const AnimatedLine = createMuiNode(MuiCharts.AnimatedLine)

export const AreaElement = createMuiNode(MuiCharts.AreaElement)
export const AreaPlot = createMuiNode(MuiCharts.AreaPlot)

export const BarChart = createMuiNode(MuiCharts.BarChart)
export const BarElement = createMuiNode(MuiCharts.BarElement)
export const BarLabel = createMuiNode(MuiCharts.BarLabel)
export const BarPlot = createMuiNode(MuiCharts.BarPlot)

export const LineChart = createMuiNode(MuiCharts.LineChart)
export const LineElement = createMuiNode(MuiCharts.LineElement)
export const LineHighlightElement = createMuiNode(MuiCharts.LineHighlightElement)
export const LinePlot = createMuiNode(MuiCharts.LinePlot)
export const LineHighlightPlot = createMuiNode(MuiCharts.LineHighlightPlot)

export const PieChart = createMuiNode(MuiCharts.PieChart)
export const PieArc = createMuiNode(MuiCharts.PieArc as React.ComponentType<PieArcProps>)
export const PieArcLabel = createMuiNode(MuiCharts.PieArcLabel as React.ComponentType<PieArcLabelProps>)
export const PieArcPlot = createMuiNode(MuiCharts.PieArcPlot)
export const PieArcLabelPlot = createMuiNode(MuiCharts.PieArcLabelPlot)
export const PiePlot = createMuiNode(MuiCharts.PiePlot)
export const PiecewiseColorLegend = createMuiNode(MuiCharts.PiecewiseColorLegend)

export const Scatter = createMuiNode(MuiCharts.Scatter)
export const ScatterChart = createMuiNode(MuiCharts.ScatterChart)
export const ScatterMarker = createMuiNode(MuiCharts.ScatterMarker)
export const ScatterPlot = createMuiNode(MuiCharts.ScatterPlot)

export const Unstable_RadarChart = createMuiNode(MuiCharts.Unstable_RadarChart)
export const Unstable_RadarDataProvider = createMuiNode(MuiCharts.Unstable_RadarDataProvider)
export const RadarChart = createMuiNode(MuiCharts.RadarChart)
export const RadarSeriesArea = createMuiNode(MuiCharts.RadarSeriesArea)
export const RadarSeriesMarks = createMuiNode(MuiCharts.RadarSeriesMarks)
export const RadarSeriesPlot = createMuiNode(MuiCharts.RadarSeriesPlot)
export const RadarAxisHighlight = createMuiNode(MuiCharts.RadarAxisHighlight)
export const RadarGrid = createMuiNode(MuiCharts.RadarGrid)
export const RadarMetricLabels = createMuiNode(MuiCharts.RadarMetricLabels)
export const RadarDataProvider = createMuiNode(MuiCharts.RadarDataProvider)
