// Nodes the compiler leaves whole on the runtime path, one per reason it
// gives: css a factory composes with its defaults rather than merges, css
// nested one level deeper than the compiler serializes (beside a node at the
// deepest level it does), theme tokens in a selector, in an at-rule holding no
// block and in two at-rule keys a theme may make one, a hole beside a themed
// condition, serialized styles, a key JavaScript orders first, a call-site
// value in a key the defaults read, a number in exponent form, and props that
// are not an object literal or hold a getter.
import { useState, type ReactElement } from 'react'
import { createNode, Div, Span } from '@meonode/ui'
import type { CaseMeta } from '../case.js'

export const meta: CaseMeta = {
  shapes: ['place.css', 'place.style-props', 'place.create-node', 'value.token', 'dyn.state', 'env.ssr-hydrate'],
  routes: [
    'CARRIER',
    'RUNTIME:css-composed',
    'RUNTIME:css-unfollowed',
    'RUNTIME:index-key',
    'RUNTIME:layout-value',
    'RUNTIME:serialized-key',
    'RUNTIME:theme-key-collision',
    'RUNTIME:theme-key-no-block',
    'RUNTIME:theme-prelude-hole',
    'RUNTIME:theme-selector',
    'RUNTIME:too-deep',
    'RUNTIME:unpartitioned',
  ],
  routing: [
    { node: 'composed', route: 'RUNTIME:css-composed' },
    { node: 'deep-33', route: 'CARRIER' },
    { node: 'deep-34', route: 'RUNTIME:too-deep' },
    { node: 'theme-selector', route: 'RUNTIME:theme-selector' },
    { node: 'theme-no-block', route: 'RUNTIME:theme-key-no-block' },
    { node: 'theme-collision', route: 'RUNTIME:theme-key-collision' },
    { node: 'theme-hole', route: 'RUNTIME:theme-prelude-hole' },
    { node: 'serialized', route: 'RUNTIME:serialized-key' },
    { node: 'index', route: 'RUNTIME:index-key' },
    { node: 'layout', route: 'RUNTIME:layout-value' },
    { node: 'exponent', route: 'RUNTIME:css-unfollowed' },
    { node: 'unpartitioned', route: 'RUNTIME:unpartitioned' },
    { node: 'getter', route: 'RUNTIME:unpartitioned' },
  ],
  steps: [{ name: 'step 1', click: '[data-act="next"]' }],
}

const Card = createNode('div', { css: { color: 'rgb(150, 0, 0)', padding: 2 } })

export function App(): ReactElement {
  const [n, setN] = useState(1)
  const props = { key: 'unpartitioned', padding: 3, color: 'rgb(0, 80, 80)', children: 'unpartitioned' }
  return Div({
    children: [
      Span('next', { key: 'next', 'data-act': 'next', onClick: () => setN(v => v + 1) }),
      Card({ key: 'composed', css: [{ color: 'rgb(0, 0, 150)' }, { margin: 3 }], children: 'composed' }),
      Div({
        key: 'deep-33',
        className: 'd',
        css: {
          '&.d': {
            '&.d': {
              '&.d': {
                '&.d': {
                  '&.d': {
                    '&.d': {
                      '&.d': {
                        '&.d': {
                          '&.d': {
                            '&.d': {
                              '&.d': {
                                '&.d': {
                                  '&.d': {
                                    '&.d': {
                                      '&.d': {
                                        '&.d': {
                                          '&.d': {
                                            '&.d': {
                                              '&.d': {
                                                '&.d': {
                                                  '&.d': {
                                                    '&.d': {
                                                      '&.d': {
                                                        '&.d': {
                                                          '&.d': {
                                                            '&.d': {
                                                              '&.d': {
                                                                '&.d': { '&.d': { '&.d': { '&.d': { '&.d': { '&.d': { color: 'rgb(0, 100, 0)' } } } } } },
                                                              },
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                  },
                                                },
                                              },
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        children: '33 levels',
      }),
      Div({
        key: 'deep-34',
        className: 'd',
        css: {
          '&.d': {
            '&.d': {
              '&.d': {
                '&.d': {
                  '&.d': {
                    '&.d': {
                      '&.d': {
                        '&.d': {
                          '&.d': {
                            '&.d': {
                              '&.d': {
                                '&.d': {
                                  '&.d': {
                                    '&.d': {
                                      '&.d': {
                                        '&.d': {
                                          '&.d': {
                                            '&.d': {
                                              '&.d': {
                                                '&.d': {
                                                  '&.d': {
                                                    '&.d': {
                                                      '&.d': {
                                                        '&.d': {
                                                          '&.d': {
                                                            '&.d': {
                                                              '&.d': {
                                                                '&.d': {
                                                                  '&.d': { '&.d': { '&.d': { '&.d': { '&.d': { '&.d': { color: 'rgb(0, 0, 100)' } } } } } },
                                                                },
                                                              },
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                  },
                                                },
                                              },
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        children: '34 levels',
      }),
      Div({
        key: 'theme-selector',
        'data-x': 'theme.primary.default',
        css: { '&[data-x="theme.primary.default"]': { color: 'rgb(0, 0, 150)' } },
        children: 'theme selector',
      }),
      Div({ key: 'theme-no-block', css: { color: 'rgb(0, 120, 0)', '@media (min-width: theme.breakpoint.md)': 'red' }, children: 'theme no block' }),
      Div({
        key: 'theme-collision',
        css: { '@media (min-width: theme.breakpoint.md)': { padding: 5 }, '@media (min-width: 600px)': { padding: 9 } },
        children: 'theme collision',
      }),
      Div({ key: 'theme-hole', width: `${n * 40}px`, css: { '@media (max-width: theme.breakpoint.md)': { padding: 4 } }, children: 'theme hole' }),
      Div({ key: 'serialized', css: { styles: 'color: rgb(0, 120, 0); padding: 2px;' }, children: 'serialized' }),
      Div({ key: 'index', css: { color: 'rgb(0, 0, 120)', 10: 'red' }, children: 'index key' }),
      Div({ key: 'layout', display: 'flex', flex: `${n}`, children: 'layout' }),
      Div({ key: 'exponent', opacity: 1e-7, children: 'exponent' }),
      Div(props),
      Div({
        key: 'getter',
        padding: 2,
        get title() {
          return 'getter'
        },
        children: 'getter',
      }),
    ],
  } as never).render() as ReactElement
}
