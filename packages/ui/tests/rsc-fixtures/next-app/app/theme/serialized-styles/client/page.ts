'use client'
import { css, keyframes } from '@emotion/react'
import { SerializedStylesTree } from '../../../_components/serialized-styles-tree'

/** A slide whose start is offset by a numeric spacing token. */
const slide = keyframes({ from: { marginLeft: 'theme.spacing.md' }, to: { marginLeft: 0 } })

export default function Page() {
  return SerializedStylesTree({
    testId: 'serialized-styles',
    styled: css({ padding: 'theme.spacing.md' }),
    keyframesValue: { animationName: slide, animationDuration: '1s' },
  }).render()
}
