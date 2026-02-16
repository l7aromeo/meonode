import React from 'react'
import { PieItemId, PieArcClasses, PieArcLabelClasses } from '@mui/x-charts'

export declare interface PieArcOwnerState {
  id: PieItemId
  dataIndex: number
  color: string
  isFaded: boolean
  isHighlighted: boolean
  isFocused: boolean
  stroke?: string
  classes?: Partial<PieArcClasses>
}

export type PieArcProps = Omit<React.SVGProps<SVGPathElement>, 'ref' | 'id'> &
  PieArcOwnerState & {
    cornerRadius: number
    endAngle: number
    innerRadius: number
    onClick?: (event: React.MouseEvent<SVGPathElement, MouseEvent>) => void
    outerRadius: number
    paddingAngle: number
    startAngle: number

    /**
     * If `true`, the animation is disabled.
     */
    skipAnimation?: boolean

    /**
     * If `true`, the default event handlers are disabled.
     * Those are used, for example, to display a tooltip or highlight the arc on hover.
     */
    skipInteraction?: boolean
  } & React.RefAttributes<SVGPathElement>

export interface PieArcLabelOwnerState {
  id: PieItemId
  color: string
  isFaded: boolean
  isHighlighted: boolean
  skipAnimation: boolean
  classes?: Partial<PieArcLabelClasses>
}
export type PieArcLabelProps = PieArcLabelOwnerState &
  Omit<React.SVGProps<SVGTextElement>, 'ref' | 'color' | 'id'> & {
    startAngle: number
    endAngle: number
    innerRadius: number
    outerRadius: number
    arcLabelRadius: number
    cornerRadius: number
    paddingAngle: number
    skipAnimation: boolean
    formattedArcLabel?: string | null
    hidden?: boolean
  }
