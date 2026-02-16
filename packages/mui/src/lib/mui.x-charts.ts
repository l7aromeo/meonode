import React from 'react'
import createMuiNode from '@src/core.js'
import {
  ChartContainer as MuiChartContainer,
  ChartDataProvider as MuiChartDataProvider,
  ChartsAxis as MuiChartsAxis,
  ChartsXAxis as MuiChartsXAxis,
  ChartsYAxis as MuiChartsYAxis,
  ChartsAxisHighlight as MuiChartsAxisHighlight,
  ChartsAxisHighlightPath as MuiChartsAxisHighlightPath,
  ChartsClipPath as MuiChartsClipPath,
  ChartsGrid as MuiChartsGrid,
  ChartsItemTooltipContent as MuiChartsItemTooltipContent,
  ChartsLabel as MuiChartsLabel,
  ChartsLabelMark as MuiChartsLabelMark,
  ChartsLegend as MuiChartsLegend,
  ChartsLocalizationProvider as MuiChartsLocalizationProvider,
  ChartsReferenceLine as MuiChartsReferenceLine,
  ChartsSurface as MuiChartsSurface,
  ChartsText as MuiChartsText,
  ChartsTooltip as MuiChartsTooltip,
  ChartsTooltipContainer as MuiChartsTooltipContainer,
  ChartsTooltipPaper as MuiChartsTooltipPaper,
  ChartsTooltipTable as MuiChartsTooltipTable,
  ChartsTooltipCell as MuiChartsTooltipCell,
  ChartsTooltipRow as MuiChartsTooltipRow,
  ChartsWrapper as MuiChartsWrapper,
  ChartsBrushOverlay as MuiChartsBrushOverlay,
  Toolbar as MuiToolbar,
  ToolbarButton as MuiToolbarButton,
  AnimatedArea as MuiAnimatedArea,
  AnimatedLine as MuiAnimatedLine,
  AreaElement as MuiAreaElement,
  AreaPlot as MuiAreaPlot,
  BarChart as MuiBarChart,
  BarElement as MuiBarElement,
  BarLabel as MuiBarLabel,
  BarPlot as MuiBarPlot,
  FocusedBar as MuiFocusedBar,
  LineChart as MuiLineChart,
  LineElement as MuiLineElement,
  LineHighlightElement as MuiLineHighlightElement,
  LinePlot as MuiLinePlot,
  LineHighlightPlot as MuiLineHighlightPlot,
  MarkPlot as MuiMarkPlot,
  MarkElement as MuiMarkElement,
  FocusedLineMark as MuiFocusedLineMark,
  PieChart as MuiPieChart,
  PieArc as MuiPieArc,
  PieArcLabel as MuiPieArcLabel,
  PieArcPlot as MuiPieArcPlot,
  PieArcLabelPlot as MuiPieArcLabelPlot,
  PiePlot as MuiPiePlot,
  ScatterChart as MuiScatterChart,
  Scatter as MuiScatter,
  ScatterMarker as MuiScatterMarker,
  ScatterPlot as MuiScatterPlot,
  FocusedScatterMark as MuiFocusedScatterMark,
  SparkLineChart as MuiSparkLineChart,
  RadarChart as MuiRadarChart,
  RadarSeriesArea as MuiRadarSeriesArea,
  RadarSeriesMarks as MuiRadarSeriesMarks,
  RadarSeriesPlot as MuiRadarSeriesPlot,
  RadarAxisHighlight as MuiRadarAxisHighlight,
  RadarGrid as MuiRadarGrid,
  RadarMetricLabels as MuiRadarMetricLabels,
  RadarDataProvider as MuiRadarDataProvider,
  FocusedRadarMark as MuiFocusedRadarMark,
  Gauge as MuiGauge,
  GaugeContainer as MuiGaugeContainer,
  GaugeValueText as MuiGaugeValueText,
  GaugeValueArc as MuiGaugeValueArc,
  GaugeReferenceArc as MuiGaugeReferenceArc,
  ContinuousColorLegend as MuiContinuousColorLegend,
  PiecewiseColorLegend as MuiPiecewiseColorLegend,
} from '@mui/x-charts'
import { PieArcLabelProps, PieArcProps } from '@src/lib/mui.x-charts.type.js'

/**
 * Export Material-UI X Charts component factories with enhanced type-safety and prop validation.
 */

// Container components
export const ChartContainer = createMuiNode(MuiChartContainer)
export const ChartDataProvider = createMuiNode(MuiChartDataProvider)

// Axis components
export const ChartsAxis = createMuiNode(MuiChartsAxis)
export const ChartsXAxis = createMuiNode(MuiChartsXAxis)
export const ChartsYAxis = createMuiNode(MuiChartsYAxis)
export const ChartsAxisHighlight = createMuiNode(MuiChartsAxisHighlight)
export const ChartsAxisHighlightPath = createMuiNode(MuiChartsAxisHighlightPath)

// Grid and surface components
export const ChartsGrid = createMuiNode(MuiChartsGrid)
export const ChartsSurface = createMuiNode(MuiChartsSurface)
export const ChartsClipPath = createMuiNode(MuiChartsClipPath)

// Label and text components
export const ChartsLabel = createMuiNode(MuiChartsLabel)
export const ChartsLabelMark = createMuiNode(MuiChartsLabelMark)
export const ChartsText = createMuiNode(MuiChartsText)

// Legend components
export const ChartsLegend = createMuiNode(MuiChartsLegend)
export const ContinuousColorLegend = createMuiNode(MuiContinuousColorLegend)
export const PiecewiseColorLegend = createMuiNode(MuiPiecewiseColorLegend)

// Tooltip components
export const ChartsTooltip = createMuiNode(MuiChartsTooltip)
export const ChartsTooltipContainer = createMuiNode(MuiChartsTooltipContainer)
export const ChartsTooltipPaper = createMuiNode(MuiChartsTooltipPaper)
export const ChartsTooltipTable = createMuiNode(MuiChartsTooltipTable)
export const ChartsTooltipCell = createMuiNode(MuiChartsTooltipCell)
export const ChartsTooltipRow = createMuiNode(MuiChartsTooltipRow)
export const ChartsItemTooltipContent = createMuiNode(MuiChartsItemTooltipContent)

// Localization components
export const ChartsLocalizationProvider = createMuiNode(MuiChartsLocalizationProvider)

// Reference line components
export const ChartsReferenceLine = createMuiNode(MuiChartsReferenceLine)

// Wrapper and utility components
export const ChartsWrapper = createMuiNode(MuiChartsWrapper)
export const ChartsBrushOverlay = createMuiNode(MuiChartsBrushOverlay)

// Toolbar components
export const Toolbar = createMuiNode(MuiToolbar)
export const ToolbarButton = createMuiNode(MuiToolbarButton)

// Bar chart components
export const BarChart = createMuiNode(MuiBarChart)
export const BarElement = createMuiNode(MuiBarElement)
export const BarLabel = createMuiNode(MuiBarLabel)
export const BarPlot = createMuiNode(MuiBarPlot)
export const FocusedBar = createMuiNode(MuiFocusedBar)

// Line chart components
export const LineChart = createMuiNode(MuiLineChart)
export const LineElement = createMuiNode(MuiLineElement)
export const LineHighlightElement = createMuiNode(MuiLineHighlightElement)
export const LinePlot = createMuiNode(MuiLinePlot)
export const LineHighlightPlot = createMuiNode(MuiLineHighlightPlot)
export const MarkPlot = createMuiNode(MuiMarkPlot)
export const MarkElement = createMuiNode(MuiMarkElement)
export const FocusedLineMark = createMuiNode(MuiFocusedLineMark)

// Area chart components
export const AreaPlot = createMuiNode(MuiAreaPlot)
export const AreaElement = createMuiNode(MuiAreaElement)
export const AnimatedArea = createMuiNode(MuiAnimatedArea)
export const AnimatedLine = createMuiNode(MuiAnimatedLine)

// Pie chart components
export const PieChart = createMuiNode(MuiPieChart)
export const PieArc = createMuiNode(MuiPieArc as React.ComponentType<PieArcProps>)
export const PieArcLabel = createMuiNode(MuiPieArcLabel as React.ComponentType<PieArcLabelProps>)
export const PieArcPlot = createMuiNode(MuiPieArcPlot)
export const PieArcLabelPlot = createMuiNode(MuiPieArcLabelPlot)
export const PiePlot = createMuiNode(MuiPiePlot)

// Scatter chart components
export const ScatterChart = createMuiNode(MuiScatterChart)
export const Scatter = createMuiNode(MuiScatter)
export const ScatterMarker = createMuiNode(MuiScatterMarker)
export const ScatterPlot = createMuiNode(MuiScatterPlot)
export const FocusedScatterMark = createMuiNode(MuiFocusedScatterMark)

// Sparkline chart components
export const SparkLineChart = createMuiNode(MuiSparkLineChart)

// Radar chart components
export const RadarChart = createMuiNode(MuiRadarChart)
export const RadarSeriesArea = createMuiNode(MuiRadarSeriesArea)
export const RadarSeriesMarks = createMuiNode(MuiRadarSeriesMarks)
export const RadarSeriesPlot = createMuiNode(MuiRadarSeriesPlot)
export const RadarAxisHighlight = createMuiNode(MuiRadarAxisHighlight)
export const RadarGrid = createMuiNode(MuiRadarGrid)
export const RadarMetricLabels = createMuiNode(MuiRadarMetricLabels)
export const RadarDataProvider = createMuiNode(MuiRadarDataProvider)
export const FocusedRadarMark = createMuiNode(MuiFocusedRadarMark)

// Gauge components
export const Gauge = createMuiNode(MuiGauge)
export const GaugeContainer = createMuiNode(MuiGaugeContainer)
export const GaugeValueText = createMuiNode(MuiGaugeValueText)
export const GaugeValueArc = createMuiNode(MuiGaugeValueArc)
export const GaugeReferenceArc = createMuiNode(MuiGaugeReferenceArc)
