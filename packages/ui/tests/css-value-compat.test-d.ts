/**
 * Compile-time verification that css values typed as plain strings and numbers
 * stay accepted while css values keep their literal options. Each line compiled
 * before the literal options were kept; none may stop compiling.
 * Run: bunx tsc --noEmit (included in project typecheck).
 */
import { Div } from '@src/components/html.node'
import type { CssProp } from '@src/types/node.type'

declare const widened: string
declare const token: `theme.${string}`
declare const n: number

// --- css values ---
export const widenedValues = Div({ css: { position: widened, display: widened, padding: widened } })
export const tokenValues = Div({ css: { position: token, padding: token, color: `${token}` } })
export const numberValues = Div({ css: { padding: n, margin: `${n}px`, zIndex: n } })
export const widenedFallbacks = Div({ css: { display: ['-webkit-box', widened] } })
export const annotated: CssProp = { position: widened, '&:hover': { position: widened, padding: n } }
// A literal inferred through the props' free type parameter arrives widened.
export const nestedLiteral = Div({ css: { position: 'relative', '& img': { position: 'absolute', inset: 0 } } })
export const underAs = Div({ as: 'a', href: '#', css: { position: widened, display: ['flex', widened] } })

// --- direct style props ---
export const widenedProps = Div({ display: widened, padding: widened, width: widened })
export const tokenProps = Div({ padding: token, color: token })
export const numberProps = Div({ padding: n, zIndex: n, opacity: n })
export const propsUnderAs = Div({ as: 'a', href: '#', padding: widened, display: widened })
