// The case corpus. Each entry becomes `app/_cases/<id>.ts`, a server component
// module whose default export renders the case, and is mounted under every
// layout (`cp`, `sp`, `np`, `cpd`). Every element the harness measures carries
// `data-probe`; a case may have several.
//
// `client` entries become `app/_cases/_client/<name>.ts` with `'use client'`.

const UI = `import { A, Button, createChildrenFirstNode, createNode, Div, Img, Input, Label, Node, P, Section, Span, Svg, SvgCircle } from '@meonode/ui'`
const WIDE = `'@media (min-width: theme.breakpoint.wide)'`
const HIT = `'rgb(1, 2, 3)'`

/** A server case whose body is the expression returned from `Case()`. */
const s = (body, extraImports = '') => `${UI}\n${extraImports}\n\nexport default function Case() {\n  return (${body}).render()\n}\n`

export const clientModules = {
  // A client component that forwards className, handed css by a server component.
  'client-box': `'use client'
import type { ReactNode } from 'react'
import { Div } from '@meonode/ui'

export function ClientBox({ className, children }: { className?: string; children?: ReactNode }) {
  return Div({ className, 'data-probe': 'a', children }).render()
}
`,
  // Host tags styled inside a client component: the StyledRenderer path in every version.
  'client-styled': `'use client'
import { Div } from '@meonode/ui'

export function ClientStyled() {
  return Div({
    'data-probe': 'a',
    padding: 'theme.spacing.md',
    css: {
      color: 'theme.accent',
      ${WIDE}: { color: ${HIT} },
      '&:hover': { backgroundColor: 'theme.primary' },
    },
    children: 'client',
  }).render()
}
`,
  'client-fn': `'use client'
import { Div } from '@meonode/ui'

export function ClientFn() {
  return Div({ 'data-probe': 'a', css: { color: theme => theme.system.accent, ${WIDE}: { color: theme => theme.system.primary.default } }, children: 'client fn' }).render()
}
`,
}

export const cases = {
  // ── Tokens in values ────────────────────────────────────────────────────
  'val-flat-default': s(`Div({ 'data-probe': 'a', color: 'theme.primary', backgroundColor: 'theme.surface', children: 'x' })`),
  'val-css-default': s(`Div({ 'data-probe': 'a', css: { color: 'theme.primary', backgroundColor: 'theme.surface' }, children: 'x' })`),
  'val-css-path': s(`Div({ 'data-probe': 'a', css: { color: 'theme.primary.content', backgroundColor: 'theme.primary.default' }, children: 'x' })`),
  'val-number-length': s(`Div({ 'data-probe': 'a', css: { padding: 'theme.spacing.md', borderRadius: 'theme.radius.md', zIndex: 'theme.z.top', position: 'relative' }, children: 'x' })`),
  'val-string-length': s(`Div({ 'data-probe': 'a', css: { margin: 'theme.spacing.lg', gap: 'theme.layout.gap', display: 'flex' }, children: 'x' })`),
  'val-inline': s(`Div({ 'data-probe': 'a', css: { border: '2px solid theme.accent', boxShadow: '0 0 0 3px theme.primary' }, children: 'x' })`),
  'val-calc': s(`Div({ 'data-probe': 'a', css: { display: 'grid', width: 'calc(theme.layout.prose + 10px)', gridTemplateColumns: 'minmax(0, theme.layout.prose) 1fr' }, children: 'x' })`),
  'val-fallback-array': s(`Div({ 'data-probe': 'a', css: { fontFamily: ['Arial', 'theme.font.body'] }, children: 'x' })`),
  'val-important': s(`Div({ 'data-probe': 'a', css: { color: 'theme.accent !important' }, children: 'x' })`),
  'val-missing': s(`Div({ 'data-probe': 'a', css: { color: 'theme.nope.missing', padding: 2 }, children: 'x' })`),
  'val-custom-prop': s(`Div({ 'data-probe': 'a', css: { '--local': 'theme.accent', color: 'var(--local)' }, children: 'x' })`),
  'val-transition': s(`Div({ 'data-probe': 'a', css: { transition: 'color theme.duration.fast' }, children: 'x' })`),
  'val-flat-and-css': s(`Div({ 'data-probe': 'a', padding: 'theme.spacing.md', color: 'theme.accent', css: { margin: 'theme.spacing.sm' }, children: 'x' })`),

  // ── Tokens in at-rule conditions ────────────────────────────────────────
  'media-min': s(`Div({ 'data-probe': 'a', css: { ${WIDE}: { color: ${HIT} } }, children: 'x' })`),
  'media-range': s(`Div({ 'data-probe': 'a', css: { '@media (width >= theme.breakpoint.wide)': { color: ${HIT} } }, children: 'x' })`),
  'media-two-tokens': s(`Div({ 'data-probe': 'a', css: { '@media (theme.breakpoint.compact <= width < theme.breakpoint.wide)': { color: ${HIT} } }, children: 'x' })`),
  'media-number-token': s(`Div({ 'data-probe': 'a', css: { '@media (min-width: theme.breakpoint.num)': { color: ${HIT} } }, children: 'x' })`),
  'media-screen-and': s(`Div({ 'data-probe': 'a', css: { '@media screen and (min-width: theme.breakpoint.compact)': { color: ${HIT} } }, children: 'x' })`),
  'media-max': s(`Div({ 'data-probe': 'a', css: { '@media (max-width: theme.breakpoint.compact)': { color: ${HIT} } }, children: 'x' })`),
  'media-literal-token-body': s(`Div({ 'data-probe': 'a', css: { '@media (min-width: 1000px)': { color: 'theme.accent', padding: 'theme.spacing.md' } }, children: 'x' })`),
  'media-prefers': s(`Div({ 'data-probe': 'a', css: { '@media (prefers-reduced-motion: no-preference)': { color: 'theme.accent' } }, children: 'x' })`),
  'container-token': s(`Div({ css: { containerType: 'inline-size', width: '100%' }, children: Div({ 'data-probe': 'a', css: { '@container (min-width: theme.breakpoint.compact)': { color: ${HIT} } }, children: 'x' }) })`),
  'supports-literal': s(`Div({ 'data-probe': 'a', css: { '@supports (display: grid)': { color: 'theme.accent', padding: 'theme.spacing.md' } }, children: 'x' })`),
  'nested-at': s(`Div({ 'data-probe': 'a', css: { '@media (min-width: theme.breakpoint.compact)': { '@supports (display: grid)': { color: ${HIT}, '&:hover': { backgroundColor: 'theme.accent' } } } }, children: 'x' })`),
  'media-inside-hover': s(`Div({ 'data-probe': 'a', css: { '&:hover': { [${WIDE}]: { color: ${HIT} } } }, children: 'x' })`),
  'layer': s(`Div({ 'data-probe': 'a', css: { '@layer base': { color: 'theme.accent' } }, children: 'x' })`),
  'keyframes-inline': s(`Div({ 'data-probe': 'a', css: { '@keyframes rscdiff-fade': { from: { opacity: 0 }, to: { opacity: 1 } }, animation: 'rscdiff-fade theme.duration.fast' }, children: 'x' })`),

  // ── Tokens in selector keys ─────────────────────────────────────────────
  'sel-hover': s(`Div({ 'data-probe': 'a', css: { '&:hover': { color: 'theme.accent', padding: 'theme.spacing.md' } }, children: 'x' })`),
  'sel-child': s(`Div({ css: { '& > .x': { color: 'theme.accent' } }, children: Span('child', { className: 'x', 'data-probe': 'child' }) })`),
  'sel-attr': s(`Div({ 'data-probe': 'a', 'data-on': '1', css: { '&[data-on="1"]': { color: 'theme.accent' } }, children: 'x' })`),
  'sel-parent-attr': s(`Div({ 'data-probe': 'a', css: { 'html[lang="en"] &': { color: 'theme.accent' }, '[data-theme="light"] &': { backgroundColor: 'theme.primary' } }, children: 'x' })`),
  'sel-before': s(`Div({ 'data-probe': 'a', css: { '&::before': { content: '"b"', color: 'theme.accent' } }, children: 'x' })`),
  'sel-is': s(`Div({ 'data-probe': 'a', className: 'b', css: { '&:is(.a, .b)': { color: 'theme.accent' } }, children: 'x' })`),
  'sel-classname-with-theme': s(`Div({ css: { '& .theme.accent': { color: ${HIT} } }, children: Span('x', { className: 'theme accent', 'data-probe': 'child' }) })`),
  'sel-deep': s(`Div({ css: { '&:hover': { '& .x': { '@media (min-width: theme.breakpoint.compact)': { color: ${HIT} } } } }, children: Span('x', { className: 'x', 'data-probe': 'child' }), 'data-probe': 'a' })`),

  // ── 3.1.0's css shapes ──────────────────────────────────────────────────
  'shape-array': s(`Div({ 'data-probe': 'a', css: [{ color: 'theme.accent' }, { ${WIDE}: { color: ${HIT} } }], children: 'x' })`),
  'shape-string': s(`Div({ 'data-probe': 'a', css: 'color: theme.accent; @media (min-width: theme.breakpoint.wide) { color: rgb(1, 2, 3); }', children: 'x' })`),
  'shape-false': s(`Div({ 'data-probe': 'a', padding: 3, css: false, children: 'x' })`),

  // ── Theme functions ─────────────────────────────────────────────────────
  'fn-value': s(`Div({ 'data-probe': 'a', css: { color: theme => theme.system.accent }, children: 'x' })`),
  'fn-whole': s(`Div({ 'data-probe': 'a', css: theme => ({ color: theme.system.accent }), children: 'x' })`),
  'fn-in-media': s(`Div({ 'data-probe': 'a', css: { '@media (min-width: 1000px)': { color: theme => theme.system.accent } }, children: 'x' })`),
  'fn-in-array': s(`Div({ 'data-probe': 'a', css: [{ margin: 2 }, theme => ({ color: theme.system.accent })], children: 'x' })`),
  'fn-flat': s(`Div({ 'data-probe': 'a', color: theme => theme.system.accent, children: 'x' })`),

  // ── Element kinds ───────────────────────────────────────────────────────
  'as-swap': s(`Div({ 'data-probe': 'a', as: 'a', href: '#', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'x' })`),
  'fn-component': `${UI}
import type { ReactNode } from 'react'

function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return Div({ className, 'data-probe': 'a', children }).render()
}

export default function Case() {
  return Div({ children: Node(Card, { css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} }, '&:hover': { padding: 'theme.spacing.md' } }, children: 'card' }) }).render()
}
`,
  'fn-createnode-merge': `${UI}
import type { ReactNode } from 'react'

function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return Div({ className, 'data-probe': 'a', children }).render()
}
const CardNode = createNode(Card, { css: { ${WIDE}: { color: ${HIT} }, '&:hover': { backgroundColor: 'theme.accent' } } })

export default function Case() {
  return Div({ children: CardNode({ css: { margin: 3, padding: 'theme.spacing.sm' }, children: 'card' }) }).render()
}
`,
  'host-createnode': `${UI}

const Box = createNode('div', { padding: 'theme.spacing.md', css: { ${WIDE}: { color: ${HIT} } } })

export default function Case() {
  return Box({ 'data-probe': 'a', css: { borderColor: 'theme.accent', borderStyle: 'solid' }, children: 'box' }).render()
}
`,
  'children-first': `${UI}

const Tag = createChildrenFirstNode('span', { css: { ${WIDE}: { color: ${HIT} } } })

export default function Case() {
  return Div({ children: Tag('tag', { 'data-probe': 'a', backgroundColor: 'theme.accent' }) }).render()
}
`,
  'classname-host': s(`Div({ 'data-probe': 'a', className: 'external', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'x' })`),
  'classname-composed': `${UI}
import type { ReactNode } from 'react'

// A server component that styles itself and takes the caller's css as className.
function Inner({ className, children }: { className?: string; children?: ReactNode }) {
  return Div({ className, 'data-probe': 'a', color: 'rgb(0, 128, 128)', css: { ${WIDE}: { backgroundColor: 'theme.primary' } }, children }).render()
}

export default function Case() {
  return Div({ children: Node(Inner, { css: { color: 'theme.accent', paddingLeft: '7px' }, children: 'inner' }) }).render()
}
`,
  'client-ref-css': `${UI}
import { ClientBox } from './_client/client-box'

export default function Case() {
  return Div({ children: Node(ClientBox, { css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'client ref' }) }).render()
}
`,
  'client-styled': `${UI}
import { ClientStyled } from './_client/client-styled'

export default function Case() {
  return Div({ children: Node(ClientStyled) }).render()
}
`,
  'client-fn': `${UI}
import { ClientFn } from './_client/client-fn'

export default function Case() {
  return Div({ children: Node(ClientFn) }).render()
}
`,
  'next-link': `${UI}
import NextLink from 'next/link'

const Link = createNode(NextLink)

export default function Case() {
  return Div({ children: Link({ href: '/', 'data-probe': 'a', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'link' }) }).render()
}
`,
  'svg': s(`Div({ children: Svg({ 'data-probe': 'a', width: 20, height: 20, css: { fill: 'theme.accent', ${WIDE}: { fill: ${HIT} } }, children: SvgCircle({ cx: 10, cy: 10, r: 8 }) }) })`),
  'void-root': s(`Img({ 'data-probe': 'a', alt: '', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', css: { borderColor: 'theme.accent', borderStyle: 'solid', ${WIDE}: { borderWidth: '5px' } } })`),
  'void-in-host': s(`Div({ children: Input({ 'data-probe': 'a', readOnly: true, value: 'v', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } } }) })`),
  'async-server': `${UI}

// A microtask, not a timer: Cache Components reads a timer in a prerender as dynamic data.
export default async function Case() {
  await Promise.resolve()
  return Div({ 'data-probe': 'a', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'async' }).render()
}
`,
  'suspense-async-child': `${UI}
import { Suspense } from 'react'

async function Child() {
  await new Promise(resolve => setTimeout(resolve, 20))
  return Div({ 'data-probe': 'a', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'child' }).render()
}

export default function Case() {
  return Div({ children: Node(Suspense, { fallback: null, children: Node(Child) }) }).render()
}
`,
  'use-cache-inside': `${UI}

async function Cached() {
  'use cache'
  return Div({ 'data-probe': 'a', padding: 'theme.spacing.md', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'cached' }).render()
}

export default function Case() {
  return Div({ children: Node(Cached) }).render()
}
`,
  'use-cache-across-css': `${UI}
import type { ReactNode } from 'react'

async function Cached({ className, children }: { className?: string; children?: ReactNode }) {
  'use cache'
  return Div({ className, 'data-probe': 'a', color: 'rgb(0, 128, 128)', children }).render()
}

export default function Case() {
  return Div({ children: Node(Cached, { css: { color: 'theme.accent', ${WIDE}: { backgroundColor: 'theme.primary' } }, children: 'across' }) }).render()
}
`,
  'use-cache-across-styled': `${UI}
import type { ReactNode } from 'react'

async function Cached({ className, children }: { className?: string; children?: ReactNode }) {
  'use cache'
  return Div({ className, 'data-probe': 'a', color: 'rgb(0, 128, 128)', css: { ${WIDE}: { backgroundColor: 'theme.primary' } }, children }).render()
}

export default function Case() {
  return Div({ children: Node(Cached, { css: { color: 'theme.accent', paddingLeft: '7px' }, children: 'across' }) }).render()
}
`,
  'node-theme-prop': `${UI}
import { tokens } from '../_shared/theme'

export default function Case() {
  return Div({ theme: { mode: 'light', system: tokens }, children: Div({ 'data-probe': 'a', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'scoped' }) }).render()
}
`,
  'style-and-data': s(`Div({ 'data-probe': 'a', 'data-token': 'theme.accent', style: { color: 'theme.accent' }, children: 'x' })`),
  'flex-defaults': s(`Div({ display: 'flex', children: Span('x', { 'data-probe': 'a', flex: '1 1 auto' }) })`),
  'shared-css-siblings': s(`Div({ children: [Div({ key: 1, 'data-probe': 'a', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'one' }), Div({ key: 2, 'data-probe': 'b', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } }, children: 'two' })] })`),
  'disable-emotion': s(`Div({ 'data-probe': 'a', disableEmotion: true, color: 'theme.accent', children: 'x' })`),
  'hover-flat': s(`Button('b', { 'data-probe': 'a', padding: 'theme.spacing.sm', css: { '&:hover': { color: 'theme.accent' }, '&:focus-visible': { outline: '2px solid theme.primary' } } })`),
  // ── A token in a key combined with shapes a StyledRenderer route cannot carry ──
  'key-and-fn-value': s(`Div({ 'data-probe': 'a', css: { color: theme => theme.system.accent, ${WIDE}: { backgroundColor: ${HIT} } }, children: 'x' })`),
  'key-and-flat-fn': s(`Div({ 'data-probe': 'a', color: theme => theme.system.accent, css: { ${WIDE}: { backgroundColor: ${HIT} } }, children: 'x' })`),
  'key-and-fn-in-array': s(`Div({ 'data-probe': 'a', css: [theme => ({ color: theme.system.accent }), { ${WIDE}: { backgroundColor: ${HIT} } }], children: 'x' })`),
  'key-missing-token': s(`Div({ 'data-probe': 'a', css: { color: 'theme.accent', '@media (min-width: theme.nope.missing)': { color: ${HIT} } }, children: 'x' })`),
  'key-async-children': `${UI}

async function Child() {
  await Promise.resolve()
  return Span('child', { 'data-probe': 'child', css: { color: 'theme.accent', ${WIDE}: { color: ${HIT} } } }).render()
}

export default function Case() {
  return Div({ 'data-probe': 'a', css: { padding: 'theme.spacing.sm', ${WIDE}: { backgroundColor: 'theme.primary' } }, children: Node(Child) }).render()
}
`,
  'key-host-in-fn-classname': `${UI}
import type { ReactNode } from 'react'

// The caller's css reaches the host as a server-compiled className; the host's own css has a themed key.
function Inner({ className, children }: { className?: string; children?: ReactNode }) {
  return Div({ className, 'data-probe': 'a', color: 'rgb(0, 128, 128)', paddingLeft: '2px', css: { ${WIDE}: { backgroundColor: 'theme.primary' } }, children }).render()
}

export default function Case() {
  return Div({ children: Node(Inner, { css: { color: 'theme.accent', paddingLeft: '7px' }, children: 'inner' }) }).render()
}
`,
  'key-in-selector-token': s(`Div({ 'data-probe': 'a', 'data-tone': 'rgb(200, 10, 10)', css: { '&[data-tone="theme.accent"]': { color: ${HIT} } }, children: 'x' })`),
  // ── Key order and text that only looks like a token ─────────────────────
  // A resolved key keeps its place: the literal media query written after it wins where both apply.
  'key-order': s(`Div({ 'data-probe': 'a', css: { '@media (min-width: theme.breakpoint.compact)': { color: ${HIT} }, '@media (min-width: 900px)': { color: 'rgb(4, 5, 6)' } }, children: 'x' })`),
  'key-order-reversed': s(`Div({ 'data-probe': 'a', css: { '@media (min-width: 900px)': { color: 'rgb(4, 5, 6)' }, '@media (min-width: theme.breakpoint.compact)': { color: ${HIT} } }, children: 'x' })`),
  'sel-id-with-theme': s(`Div({ css: { '& #theme.accent': { color: ${HIT} } }, children: Span('x', { id: 'theme', className: 'accent', 'data-probe': 'child' }) })`),
  'shape-string-in-array': s(`Div({ 'data-probe': 'a', css: [{ padding: 2, color: 'theme.accent' }, '@media (min-width: theme.breakpoint.wide) { color: rgb(1, 2, 3); }'], children: 'x' })`),
  'shape-string-selector-token': s(`Div({ 'data-probe': 'a', 'data-tone': 'rgb(200, 10, 10)', css: '&[data-tone="theme.accent"] { color: rgb(1, 2, 3); }', children: 'x' })`),
}
