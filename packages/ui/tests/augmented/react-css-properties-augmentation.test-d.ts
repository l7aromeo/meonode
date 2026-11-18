/**
 * An application may add properties to React's `CSSProperties`, such as a custom
 * property it uses everywhere. Such a key is not in csstype, which the style
 * types otherwise read value types from, so it keeps the type it was declared
 * with, as a style prop and in `css`.
 *
 * Run: `bun run typecheck:augmented`, which the lint script chains.
 */
import { Div, type ThemedCSSProperties } from '@meonode/ui'

declare module 'react' {
  interface CSSProperties {
    '--brand-gap'?: 'tight' | 'loose'
  }
}

export const asProp: ThemedCSSProperties['--brand-gap'] = 'tight'
export const inCss = Div({ css: { '--brand-gap': 'loose' } })

// @ts-expect-error the augmentation's own type still applies
export const notDeclared: ThemedCSSProperties['--brand-gap'] = 'medium'
