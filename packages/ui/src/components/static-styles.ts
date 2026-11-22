import type { ReactElement } from 'react'
import { staticHoistables, type StaticStylesProps } from '@src/components/static-hoistables.js'

export type { StaticStylesProps, StaticThemeCandidate, StaticThemeCheck } from '@src/components/static-hoistables.js'
export { __resetStaticStyles } from '@src/components/static-hoistables.js'

/**
 * The static css a render uses, in the server build: React hoistable styles,
 * which are all this layer can send. Its React has neither context nor effects,
 * so this module loads neither Emotion nor client hooks; the default build swaps
 * in `static-styles.default.ts`, which also inserts the classes in the browser.
 *
 * Its classes come in the order the render's nodes began, parents first, which
 * is Emotion's order. The browser takes over what this sends by `href`.
 * @param props.classes The registered classes of the render's nodes, in the order they reach the page.
 */
export function StaticStyles({ classes }: StaticStylesProps): ReactElement[] {
  return staticHoistables(classes)
}
