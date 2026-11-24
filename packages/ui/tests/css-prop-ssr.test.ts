// @vitest-environment node
//
// Server-rendered bytes for `css` values that are maps. A map is spread over the flat
// props and never takes the `[flatCssProps, css]` composition, so each row's class
// name and rule text are fixed. Runs unchanged under `test:compiled`; with css
// extraction on, the nodes are compiled and each `<style>` written in place says
// so, which the comparison takes out.
import { renderToString } from 'react-dom/server'
import { keyframes } from '@emotion/react'
import { Div, Node, type NodeInstance, type Theme, ThemeProvider } from '@src/main.js'
import { IN_PLACE_STYLE_ATTRIBUTE } from '@src/constant/common.const.js'
import { asThemeProps } from './_theme-props.js'

/** Whether this run compiles the tests with css extraction on. */
const EXTRACTED = process.env.MEONODE_EXTRACTED === '1'

const theme: Theme = { mode: 'light', system: { colors: { primary: 'rgb(255, 0, 0)' }, font: { body: 'Inter' } } }
const themed = (node: NodeInstance) => ThemeProvider({ ...asThemeProps(theme), children: node })
/** Renders `make()` from inside a React component, so the node is not a prop of its parent. */
const Wrap = ({ make }: { make: () => NodeInstance }) => make().render()
const viaComponent = (make: () => NodeInstance) => Node(Wrap, { make })
const bounce = keyframes`from { opacity: 0; } to { opacity: 1; }`

/** The server markup without the provider's `:root` variables block, nor the in-place attribute when extracted. */
const ssr = (node: NodeInstance) => {
  const html = renderToString(node.render()).replace(/<style data-meonode-theme-vars="">[^<]*<\/style>/, '')
  return EXTRACTED ? html.replaceAll(` ${IN_PLACE_STYLE_ATTRIBUTE}=""`, '') : html
}

describe('css maps render byte-identically on the server', () => {
  it.each<[string, () => NodeInstance, string]>([
    [
      'object alone',
      () => Div({ children: 'x', css: { margin: 4 } }),
      '<style data-emotion="css 0c7r5k4r2fcg6">.css-0c7r5k4r2fcg6{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;margin:4px;}</style><div class="css-0c7r5k4r2fcg6">x</div>',
    ],
    [
      'object + flat + hover',
      () => Div({ children: 'x', padding: 8, css: { margin: 4, '&:hover': { color: 'red' } } }),
      '<style data-emotion="css 4untm0flu00dc">.css-4untm0flu00dc{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;margin:4px;}.css-4untm0flu00dc:hover{color:red;}</style><div class="css-4untm0flu00dc">x</div>',
    ],
    [
      'object media',
      () => Div({ children: 'x', css: { '@media (min-width: 10px)': { margin: 2 } } }),
      '<style data-emotion="css 1d4p3n8jh7j0s">.css-1d4p3n8jh7j0s{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;}@media (min-width: 10px){.css-1d4p3n8jh7j0s{margin:2px;}}</style><div class="css-1d4p3n8jh7j0s">x</div>',
    ],
    [
      'fallback array without a token',
      () => Div({ children: 'x', css: { display: ['-webkit-box', 'flex'] } as never }),
      '<style data-emotion="css a2uo069s053vv">.css-a2uo069s053vv{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;display:-webkit-box;display:-webkit-box;display:-webkit-flex;display:-ms-flexbox;display:flex;}</style><div class="css-a2uo069s053vv">x</div>',
    ],
    [
      'object flex container',
      () => Div({ children: 'x', display: 'flex', css: { flexDirection: 'column' } }),
      '<style data-emotion="css 96qdpou33ie8d">.css-96qdpou33ie8d{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;display:-webkit-box;display:-webkit-flex;display:-ms-flexbox;display:flex;-webkit-flex-direction:column;-ms-flex-direction:column;flex-direction:column;}</style><div class="css-96qdpou33ie8d">x</div>',
    ],
    [
      'object keyframes animation',
      () => Div({ children: 'x', css: { animation: `${bounce} 1s` } }),
      '<style data-emotion="css bd22ah0nujbq8 animation-85bkd1">.css-bd22ah0nujbq8{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;-webkit-animation:animation-85bkd1 1s;animation:animation-85bkd1 1s;}@-webkit-keyframes animation-85bkd1{from{opacity:0;}to{opacity:1;}}@keyframes animation-85bkd1{from{opacity:0;}to{opacity:1;}}</style><div class="css-bd22ah0nujbq8">x</div>',
    ],
    [
      'object keyframes animationName',
      () => Div({ children: 'x', css: { animationName: bounce } as never }),
      '<style data-emotion="css 34tl64m6624r6 animation-85bkd1">.css-34tl64m6624r6{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;-webkit-animation-name:animation-85bkd1;animation-name:animation-85bkd1;}@-webkit-keyframes animation-85bkd1{from{opacity:0;}to{opacity:1;}}@keyframes animation-85bkd1{from{opacity:0;}to{opacity:1;}}</style><div class="css-34tl64m6624r6">x</div>',
    ],
    [
      'flat only',
      () => Div({ children: 'x', padding: 8 }),
      '<style data-emotion="css 7n9meh9ns0ubk">.css-7n9meh9ns0ubk{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;}</style><div class="css-7n9meh9ns0ubk">x</div>',
    ],
    [
      'css undefined',
      () => Div({ children: 'x', padding: 8, css: undefined }),
      '<style data-emotion="css 7n9meh9ns0ubk">.css-7n9meh9ns0ubk{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;}</style><div class="css-7n9meh9ns0ubk">x</div>',
    ],
    [
      'css false',
      () => Div({ children: 'x', padding: 8, css: false }),
      '<style data-emotion="css 7n9meh9ns0ubk">.css-7n9meh9ns0ubk{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;}</style><div class="css-7n9meh9ns0ubk">x</div>',
    ],
    [
      'css null',
      () => Div({ children: 'x', padding: 8, css: null }),
      '<style data-emotion="css 7n9meh9ns0ubk">.css-7n9meh9ns0ubk{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;padding:8px;}</style><div class="css-7n9meh9ns0ubk">x</div>',
    ],
    [
      'themed token',
      () => themed(Div({ children: 'x', css: { color: 'theme.colors.primary' } })),
      '<style data-emotion="css ekpvoq9cet6h6">.css-ekpvoq9cet6h6{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;color:var(--meonode-theme-colors-primary);}</style><div class="css-ekpvoq9cet6h6">x</div>',
    ],
    [
      'themed function value',
      () => themed(Div({ children: 'x', css: { color: (t: Theme) => t.system.colors.primary } })),
      '<style data-emotion="css 0f1hum3tjodse">.css-0f1hum3tjodse{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;color:rgb(255, 0, 0);}</style><div class="css-0f1hum3tjodse">x</div>',
    ],
    [
      'themed token under component',
      () => themed(viaComponent(() => Div({ children: 'x', css: { color: 'theme.colors.primary' } }))),
      '<style data-emotion="css ekpvoq9cet6h6">.css-ekpvoq9cet6h6{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;color:var(--meonode-theme-colors-primary);}</style><div class="css-ekpvoq9cet6h6">x</div>',
    ],
    [
      'fallback array with a theme token',
      () => themed(Div({ children: 'x', css: { fontFamily: ['Arial', 'theme.font.body'] } as never })),
      '<style data-emotion="css 7fgancoaqfdjl">.css-7fgancoaqfdjl{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;font-family:Arial;font-family:var(--meonode-theme-font-body);}</style><div class="css-7fgancoaqfdjl">x</div>',
    ],
    [
      'fallback array under a component boundary',
      () => themed(viaComponent(() => Div({ children: 'x', css: { fontFamily: ['Arial', 'theme.font.body'] } as never }))),
      '<style data-emotion="css 7fgancoaqfdjl">.css-7fgancoaqfdjl{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;font-family:Arial;font-family:var(--meonode-theme-font-body);}</style><div class="css-7fgancoaqfdjl">x</div>',
    ],
    [
      'string css with a theme token under a component boundary',
      () => themed(viaComponent(() => Div({ children: 'x', css: 'color: theme.colors.primary;' }))),
      '<style data-emotion="css fkcv0n8opvfmr">.css-fkcv0n8opvfmr{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;color:var(--meonode-theme-colors-primary);}</style><div class="css-fkcv0n8opvfmr">x</div>',
    ],
    [
      'array css with a theme-token string under a component boundary',
      () => themed(viaComponent(() => Div({ children: 'x', css: [{ margin: 4 }, 'color: theme.colors.primary;'] }))),
      '<style data-emotion="css 1nq8n3f38ilgn">.css-1nq8n3f38ilgn{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:0;min-width:0;margin:4px;color:var(--meonode-theme-colors-primary);}</style><div class="css-1nq8n3f38ilgn">x</div>',
    ],
  ])('%s', (_, make, expected) => {
    expect(ssr(make())).toBe(expected)
  })
})

// With no ThemeProvider there is no theme to call a theme function with, so it is
// dropped wherever it sits, and its source never reaches the stylesheet or the HTML.
describe('theme functions with no provider are dropped on the server', () => {
  it.each<[string, () => NodeInstance]>([
    ['object value', () => Div({ children: 'x', css: { margin: 4, color: (t: Theme) => t.system.colors.primary } })],
    ['array item', () => Div({ children: 'x', css: [{ margin: 4 }, (t: Theme) => ({ color: t.system.colors.primary })] })],
    ['top-level css', () => Div({ children: 'x', margin: 4, css: (t: Theme) => ({ color: t.system.colors.primary }) })],
    ['function ignoring its theme', () => Div({ children: 'x', css: { margin: 4, color: () => 'red' } })],
  ])('%s', (_, make) => {
    const html = ssr(make())
    expect(html).not.toContain('=>')
    expect(html).not.toContain('color:')
    expect(html).toContain('margin:4px;')
  })
})
