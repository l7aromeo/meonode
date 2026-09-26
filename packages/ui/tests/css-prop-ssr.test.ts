// @vitest-environment node
//
// Server-rendered bytes for `css` values that are maps, captured before the runtime
// learned to compose non-map `css` values as `[flatCssProps, css]`. That change routes
// only non-maps through the new path, so every row here must keep its exact class
// name and rule text. Runs unchanged under `test:compiled`.
import { renderToString } from 'react-dom/server'
import { keyframes } from '@emotion/react'
import { Div, Node, type NodeInstance, type Theme, ThemeProvider } from '@src/main.js'
import { asThemeProps } from './_theme-props.js'

const theme: Theme = { mode: 'light', system: { colors: { primary: 'rgb(255, 0, 0)' }, font: { body: 'Inter' } } }
const themed = (node: NodeInstance) => ThemeProvider({ ...asThemeProps(theme), children: node })
/** Renders `make()` from inside a React component, so the node is not a prop of its parent. */
const Wrap = ({ make }: { make: () => NodeInstance }) => make().render()
const viaComponent = (make: () => NodeInstance) => Node(Wrap, { make })
const bounce = keyframes`from { opacity: 0; } to { opacity: 1; }`

/** The server markup without the provider's `:root` variables block. */
const ssr = (node: NodeInstance) => renderToString(node.render()).replace(/<style data-meonode-theme-vars="">[^<]*<\/style>/, '')

describe('css maps render byte-identically on the server', () => {
  it.each<[string, () => NodeInstance, string]>([
    [
      'object alone',
      () => Div({ children: 'x', css: { margin: 4 } }),
      '<style data-emotion="css 1nrradi">.css-1nrradi{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;margin:4px;}</style><div class="css-1nrradi">x</div>',
    ],
    [
      'object + flat + hover',
      () => Div({ children: 'x', padding: 8, css: { margin: 4, '&:hover': { color: 'red' } } }),
      '<style data-emotion="css fksiaj">.css-fksiaj{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;margin:4px;}.css-fksiaj:hover{color:red;}</style><div class="css-fksiaj">x</div>',
    ],
    [
      'object media',
      () => Div({ children: 'x', css: { '@media (min-width: 10px)': { margin: 2 } } }),
      '<style data-emotion="css gwecre">.css-gwecre{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;}@media (min-width: 10px){.css-gwecre{margin:2px;}}</style><div class="css-gwecre">x</div>',
    ],
    [
      'fallback array without a token',
      () => Div({ children: 'x', css: { display: ['-webkit-box', 'flex'] } as never }),
      '<style data-emotion="css a0b8xt">.css-a0b8xt{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;display:-webkit-box;display:-webkit-box;display:-webkit-flex;display:-ms-flexbox;display:flex;}</style><div class="css-a0b8xt">x</div>',
    ],
    [
      'object flex container',
      () => Div({ children: 'x', display: 'flex', css: { flexDirection: 'column' } }),
      '<style data-emotion="css 1p5c2yh">.css-1p5c2yh{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;display:-webkit-box;display:-webkit-flex;display:-ms-flexbox;display:flex;-webkit-flex-direction:column;-ms-flex-direction:column;flex-direction:column;}</style><div class="css-1p5c2yh">x</div>',
    ],
    [
      'object keyframes animation',
      () => Div({ children: 'x', css: { animation: `${bounce} 1s` } }),
      '<style data-emotion="css 1612so7 animation-85bkd1">.css-1612so7{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;-webkit-animation:animation-85bkd1 1s;animation:animation-85bkd1 1s;}@-webkit-keyframes animation-85bkd1{from{opacity:0;}to{opacity:1;}}@keyframes animation-85bkd1{from{opacity:0;}to{opacity:1;}}</style><div class="css-1612so7">x</div>',
    ],
    [
      'object keyframes animationName',
      () => Div({ children: 'x', css: { animationName: bounce } as never }),
      '<style data-emotion="css x4cyey animation-85bkd1">.css-x4cyey{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;-webkit-animation-name:animation-85bkd1;animation-name:animation-85bkd1;}@-webkit-keyframes animation-85bkd1{from{opacity:0;}to{opacity:1;}}@keyframes animation-85bkd1{from{opacity:0;}to{opacity:1;}}</style><div class="css-x4cyey">x</div>',
    ],
    [
      'flat only',
      () => Div({ children: 'x', padding: 8 }),
      '<style data-emotion="css 2dodlv">.css-2dodlv{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;}</style><div class="css-2dodlv">x</div>',
    ],
    [
      'css undefined',
      () => Div({ children: 'x', padding: 8, css: undefined }),
      '<style data-emotion="css 2dodlv">.css-2dodlv{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;}</style><div class="css-2dodlv">x</div>',
    ],
    [
      'css false',
      () => Div({ children: 'x', padding: 8, css: false }),
      '<style data-emotion="css 2dodlv">.css-2dodlv{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;}</style><div class="css-2dodlv">x</div>',
    ],
    [
      'css null',
      () => Div({ children: 'x', padding: 8, css: null }),
      '<style data-emotion="css 2dodlv">.css-2dodlv{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;}</style><div class="css-2dodlv">x</div>',
    ],
    [
      'themed token',
      () => themed(Div({ children: 'x', css: { color: 'theme.colors.primary' } })),
      '<style data-emotion="css 1nczixz">.css-1nczixz{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;color:var(--meonode-theme-colors-primary);}</style><div class="css-1nczixz">x</div>',
    ],
    [
      'themed function value',
      () => themed(Div({ children: 'x', css: { color: (t: Theme) => t.system.colors.primary } })),
      '<style data-emotion="css flo7fy">.css-flo7fy{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;color:rgb(255, 0, 0);}</style><div class="css-flo7fy">x</div>',
    ],
    [
      'themed token under component',
      () => themed(viaComponent(() => Div({ children: 'x', css: { color: 'theme.colors.primary' } }))),
      '<style data-emotion="css 1nczixz">.css-1nczixz{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;color:var(--meonode-theme-colors-primary);}</style><div class="css-1nczixz">x</div>',
    ],
    [
      'fallback array with a theme token',
      () => themed(Div({ children: 'x', css: { fontFamily: ['Arial', 'theme.font.body'] } as never })),
      '<style data-emotion="css 1me33pq">.css-1me33pq{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;font-family:Arial;font-family:var(--meonode-theme-font-body);}</style><div class="css-1me33pq">x</div>',
    ],
    [
      'fallback array under a component boundary',
      () => themed(viaComponent(() => Div({ children: 'x', css: { fontFamily: ['Arial', 'theme.font.body'] } as never }))),
      '<style data-emotion="css 1me33pq">.css-1me33pq{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;font-family:Arial;font-family:var(--meonode-theme-font-body);}</style><div class="css-1me33pq">x</div>',
    ],
  ])('%s', (_, make, expected) => {
    expect(ssr(make())).toBe(expected)
  })
})
