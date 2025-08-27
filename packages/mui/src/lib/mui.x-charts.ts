import React from 'react'
import createMuiNode from '@src/core'
import {
  ChartsAxis as MuiChartsAxis,
  ChartsXAxis as MuiChartsXAxis,
  ChartsYAxis as MuiChartsYAxis,
  ChartsAxisHighlight as MuiChartsAxisHighlight,
  ChartsAxisHighlightPath as MuiChartsAxisHighlightPath,
  ChartsClipPath as MuiChartsClipPath,
  ChartsGrid as MuiChartsGrid,
  ChartsItemTooltipContent as MuiChartsItemTooltipContent,
  ChartsLocalizationProvider as MuiChartsLocalizationProvider,
  ChartsLabelMark as MuiChartsLabelMark,
  ChartsLegend as MuiChartsLegend,
  ChartsReferenceLine as MuiChartsReferenceLine,
  ChartsSurface as MuiChartsSurface,
  ChartsText as MuiChartsText,
  ChartsTooltip as MuiChartsTooltip,
  ChartsTooltipContainer as MuiChartsTooltipContainer,
  ChartsTooltipPaper as MuiChartsTooltipPaper,
  ChartsTooltipTable as MuiChartsTooltipTable,
  ChartsTooltipCell as MuiChartsTooltipCell,
  ChartsTooltipRow as MuiChartsTooltipRow,
  AnimatedArea as MuiAnimatedArea,
  AnimatedLine as MuiAnimatedLine,
  AreaElement as MuiAreaElement,
  AreaPlot as MuiAreaPlot,
  BarChart as MuiBarChart,
  BarElement as MuiBarElement,
  BarLabel as MuiBarLabel,
  BarPlot as MuiBarPlot,
  LineChart as MuiLineChart,
  LineElement as MuiLineElement,
  LineHighlightElement as MuiLineHighlightElement,
  LinePlot as MuiLinePlot,
  LineHighlightPlot as MuiLineHighlightPlot,
  PieChart as MuiPieChart,
  PieArc as MuiPieArc,
  PieArcLabel as MuiPieArcLabel,
  PieArcPlot as MuiPieArcPlot,
  PieArcLabelPlot as MuiPieArcLabelPlot,
  PiePlot as MuiPiePlot,
  PiecewiseColorLegend as MuiPiecewiseColorLegend,
  Scatter as MuiScatter,
  ScatterChart as MuiScatterChart,
  ScatterMarker as MuiScatterMarker,
  ScatterPlot as MuiScatterPlot,
  SparkLineChart as MuiSparkLineChart,
  RadarChart as MuiRadarChart,
  RadarSeriesArea as MuiRadarSeriesArea,
  RadarSeriesMarks as MuiRadarSeriesMarks,
  RadarSeriesPlot as MuiRadarSeriesPlot,
  RadarAxisHighlight as MuiRadarAxisHighlight,
  RadarGrid as MuiRadarGrid,
  RadarMetricLabels as MuiRadarMetricLabels,
  RadarDataProvider as MuiRadarDataProvider,
} from '@mui/x-charts'
import { PieArcLabelProps, PieArcProps } from '@src/lib/mui.x-charts.type'

/**
 * Export Material-UI X Charts component factories with enhanced type-safety and prop validation.
 */

export const ChartsAxis = createMuiNode(MuiChartsAxis)
export const ChartsXAxis = createMuiNode(MuiChartsXAxis)
export const ChartsYAxis = createMuiNode(MuiChartsYAxis)
export const ChartsAxisHighlight = createMuiNode(MuiChartsAxisHighlight)
export const ChartsAxisHighlightPath = createMuiNode(MuiChartsAxisHighlightPath)
export const ChartsClipPath = createMuiNode(MuiChartsClipPath)
export const ChartsGrid = createMuiNode(MuiChartsGrid)
export const ChartsItemTooltipContent = createMuiNode(MuiChartsItemTooltipContent)
export const ChartsLocalizationProvider = createMuiNode(MuiChartsLocalizationProvider)
export const ChartsLabelMark = createMuiNode(MuiChartsLabelMark)
export const ChartsLegend = createMuiNode(MuiChartsLegend)
export const ChartsReferenceLine = createMuiNode(MuiChartsReferenceLine)
export const ChartsSurface = createMuiNode(MuiChartsSurface)
export const ChartsText = createMuiNode(MuiChartsText)
export const ChartsTooltip = createMuiNode(MuiChartsTooltip)
export const ChartsTooltipContainer = createMuiNode(MuiChartsTooltipContainer)
export const ChartsTooltipPaper = createMuiNode(MuiChartsTooltipPaper)
export const ChartsTooltipTable = createMuiNode(MuiChartsTooltipTable)
export const ChartsTooltipCell = createMuiNode(MuiChartsTooltipCell)
export const ChartsTooltipRow = createMuiNode(MuiChartsTooltipRow)

export const AnimatedArea = createMuiNode(MuiAnimatedArea)
export const AnimatedLine = createMuiNode(MuiAnimatedLine)

export const AreaElement = createMuiNode(MuiAreaElement)
export const AreaPlot = createMuiNode(MuiAreaPlot)

export const BarChart = createMuiNode(MuiBarChart)
export const BarElement = createMuiNode(MuiBarElement)
export const BarLabel = createMuiNode(MuiBarLabel)
export const BarPlot = createMuiNode(MuiBarPlot)

export const LineChart = createMuiNode(MuiLineChart)
export const LineElement = createMuiNode(MuiLineElement)
export const LineHighlightElement = createMuiNode(MuiLineHighlightElement)
export const LinePlot = createMuiNode(MuiLinePlot)
export const LineHighlightPlot = createMuiNode(MuiLineHighlightPlot)

export const PieChart = createMuiNode(MuiPieChart)
export const PieArc = createMuiNode(MuiPieArc as React.ComponentType<PieArcProps>)
export const PieArcLabel = createMuiNode(MuiPieArcLabel as React.ComponentType<PieArcLabelProps>)
export const PieArcPlot = createMuiNode(MuiPieArcPlot)
export const PieArcLabelPlot = createMuiNode(MuiPieArcLabelPlot)
export const PiePlot = createMuiNode(MuiPiePlot)
export const PiecewiseColorLegend = createMuiNode(MuiPiecewiseColorLegend)

export const Scatter = createMuiNode(MuiScatter)
export const ScatterChart = createMuiNode(MuiScatterChart)
export const ScatterMarker = createMuiNode(MuiScatterMarker)
export const ScatterPlot = createMuiNode(MuiScatterPlot)

export const SparkLineChart = createMuiNode(MuiSparkLineChart)

export const RadarChart = createMuiNode(MuiRadarChart)
export const RadarSeriesArea = createMuiNode(MuiRadarSeriesArea)
export const RadarSeriesMarks = createMuiNode(MuiRadarSeriesMarks)
export const RadarSeriesPlot = createMuiNode(MuiRadarSeriesPlot)
export const RadarAxisHighlight = createMuiNode(MuiRadarAxisHighlight)
export const RadarGrid = createMuiNode(MuiRadarGrid)
export const RadarMetricLabels = createMuiNode(MuiRadarMetricLabels)
export const RadarDataProvider = createMuiNode(MuiRadarDataProvider)
