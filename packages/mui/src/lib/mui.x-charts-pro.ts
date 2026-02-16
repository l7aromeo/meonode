import React from 'react'
import createMuiNode from '@src/core.js'
import {
  ChartContainerPro as MuiChartContainerPro,
  ChartDataProviderPro as MuiChartDataProviderPro,
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
  ChartsOverlay as MuiChartsOverlay,
  AnimatedArea as MuiAnimatedArea,
  AnimatedLine as MuiAnimatedLine,
  AreaElement as MuiAreaElement,
  AreaPlot as MuiAreaPlot,
  BarChart as MuiBarChart,
  BarChartPro as MuiBarChartPro,
  BarElement as MuiBarElement,
  BarLabel as MuiBarLabel,
  BarPlot as MuiBarPlot,
  FocusedBar as MuiFocusedBar,
  LineChart as MuiLineChart,
  LineChartPro as MuiLineChartPro,
  LineElement as MuiLineElement,
  LineHighlightElement as MuiLineHighlightElement,
  LinePlot as MuiLinePlot,
  LineHighlightPlot as MuiLineHighlightPlot,
  MarkPlot as MuiMarkPlot,
  MarkElement as MuiMarkElement,
  FocusedLineMark as MuiFocusedLineMark,
  PieChart as MuiPieChart,
  PieChartPro as MuiPieChartPro,
  PieArc as MuiPieArc,
  PieArcLabel as MuiPieArcLabel,
  PieArcPlot as MuiPieArcPlot,
  PieArcLabelPlot as MuiPieArcLabelPlot,
  PiePlot as MuiPiePlot,
  ScatterChart as MuiScatterChart,
  ScatterChartPro as MuiScatterChartPro,
  Scatter as MuiScatter,
  ScatterMarker as MuiScatterMarker,
  ScatterPlot as MuiScatterPlot,
  FocusedScatterMark as MuiFocusedScatterMark,
  SparkLineChart as MuiSparkLineChart,
  RadarChart as MuiRadarChart,
  RadarChartPro as MuiRadarChartPro,
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
  Heatmap as MuiHeatmap,
  HeatmapPlot as MuiHeatmapPlot,
  HeatmapTooltip as MuiHeatmapTooltip,
  HeatmapTooltipContent as MuiHeatmapTooltipContent,
  FocusedHeatmapCell as MuiFocusedHeatmapCell,
  FunnelChart as MuiFunnelChart,
  FunnelPlot as MuiFunnelPlot,
  FunnelSection as MuiFunnelSection,
  FunnelSectionLabel as MuiFunnelSectionLabel,
  FocusedFunnelSection as MuiFocusedFunnelSection,
  SankeyPlot as MuiSankeyPlot,
  SankeyDataProvider as MuiSankeyDataProvider,
  SankeyLinkPlot as MuiSankeyLinkPlot,
  SankeyNodePlot as MuiSankeyNodePlot,
  SankeyLinkLabelPlot as MuiSankeyLinkLabelPlot,
  SankeyNodeLabelPlot as MuiSankeyNodeLabelPlot,
  FocusedSankeyLink as MuiFocusedSankeyLink,
  FocusedSankeyNode as MuiFocusedSankeyNode,
  SankeyTooltip as MuiSankeyTooltip,
  SankeyTooltipContent as MuiSankeyTooltipContent,
  ChartZoomSlider as MuiChartZoomSlider,
  ChartsToolbarPro as MuiChartsToolbarPro,
  ChartsToolbarZoomInTrigger as MuiChartsToolbarZoomInTrigger,
  ChartsToolbarZoomOutTrigger as MuiChartsToolbarZoomOutTrigger,
  ChartsToolbarPrintExportTrigger as MuiChartsToolbarPrintExportTrigger,
  ChartsToolbarImageExportTrigger as MuiChartsToolbarImageExportTrigger,
} from '@mui/x-charts-pro'
import { PieArcLabelProps, PieArcProps, ChartsToolbarZoomInTriggerProps, ChartsToolbarZoomOutTriggerProps } from '@src/lib/mui.x-charts-pro.type.js'

/**
 * Export Material-UI X Charts Pro component factories with enhanced type-safety and prop validation.
 */

// Container components
export const ChartContainerPro = createMuiNode(MuiChartContainerPro)
export const ChartDataProviderPro = createMuiNode(MuiChartDataProviderPro)

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
export const ChartsOverlay = createMuiNode(MuiChartsOverlay)

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

// Zoom slider components
export const ChartZoomSlider = createMuiNode(MuiChartZoomSlider)

// Pro toolbar components
export const ChartsToolbarPro = createMuiNode(MuiChartsToolbarPro)
export const ChartsToolbarZoomInTrigger = createMuiNode(MuiChartsToolbarZoomInTrigger as React.ComponentType<ChartsToolbarZoomInTriggerProps>)
export const ChartsToolbarZoomOutTrigger = createMuiNode(MuiChartsToolbarZoomOutTrigger as React.ComponentType<ChartsToolbarZoomOutTriggerProps>)
export const ChartsToolbarPrintExportTrigger = createMuiNode(MuiChartsToolbarPrintExportTrigger)
export const ChartsToolbarImageExportTrigger = createMuiNode(MuiChartsToolbarImageExportTrigger)

// Bar chart components
export const BarChart = createMuiNode(MuiBarChart)
export const BarChartPro = createMuiNode(MuiBarChartPro)
export const BarElement = createMuiNode(MuiBarElement)
export const BarLabel = createMuiNode(MuiBarLabel)
export const BarPlot = createMuiNode(MuiBarPlot)
export const FocusedBar = createMuiNode(MuiFocusedBar)

// Line chart components
export const LineChart = createMuiNode(MuiLineChart)
export const LineChartPro = createMuiNode(MuiLineChartPro)
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
export const PieChartPro = createMuiNode(MuiPieChartPro)
export const PieArc = createMuiNode(MuiPieArc as React.ComponentType<PieArcProps>)
export const PieArcLabel = createMuiNode(MuiPieArcLabel as React.ComponentType<PieArcLabelProps>)
export const PieArcPlot = createMuiNode(MuiPieArcPlot)
export const PieArcLabelPlot = createMuiNode(MuiPieArcLabelPlot)
export const PiePlot = createMuiNode(MuiPiePlot)

// Scatter chart components
export const ScatterChart = createMuiNode(MuiScatterChart)
export const ScatterChartPro = createMuiNode(MuiScatterChartPro)
export const Scatter = createMuiNode(MuiScatter)
export const ScatterMarker = createMuiNode(MuiScatterMarker)
export const ScatterPlot = createMuiNode(MuiScatterPlot)
export const FocusedScatterMark = createMuiNode(MuiFocusedScatterMark)

// Sparkline chart components
export const SparkLineChart = createMuiNode(MuiSparkLineChart)

// Radar chart components
export const RadarChart = createMuiNode(MuiRadarChart)
export const RadarChartPro = createMuiNode(MuiRadarChartPro)
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

// Heatmap components
export const Heatmap = createMuiNode(MuiHeatmap)
export const HeatmapPlot = createMuiNode(MuiHeatmapPlot)
export const HeatmapTooltip = createMuiNode(MuiHeatmapTooltip)
export const HeatmapTooltipContent = createMuiNode(MuiHeatmapTooltipContent)
export const FocusedHeatmapCell = createMuiNode(MuiFocusedHeatmapCell)

// Funnel chart components
export const FunnelChart = createMuiNode(MuiFunnelChart)
export const FunnelPlot = createMuiNode(MuiFunnelPlot)
export const FunnelSection = createMuiNode(MuiFunnelSection)
export const FunnelSectionLabel = createMuiNode(MuiFunnelSectionLabel)
export const FocusedFunnelSection = createMuiNode(MuiFocusedFunnelSection)

// Sankey chart components
export const SankeyPlot = createMuiNode(MuiSankeyPlot)
export const SankeyDataProvider = createMuiNode(MuiSankeyDataProvider)
export const SankeyLinkPlot = createMuiNode(MuiSankeyLinkPlot)
export const SankeyNodePlot = createMuiNode(MuiSankeyNodePlot)
export const SankeyLinkLabelPlot = createMuiNode(MuiSankeyLinkLabelPlot)
export const SankeyNodeLabelPlot = createMuiNode(MuiSankeyNodeLabelPlot)
export const FocusedSankeyLink = createMuiNode(MuiFocusedSankeyLink)
export const FocusedSankeyNode = createMuiNode(MuiFocusedSankeyNode)
export const SankeyTooltip = createMuiNode(MuiSankeyTooltip)
export const SankeyTooltipContent = createMuiNode(MuiSankeyTooltipContent)
