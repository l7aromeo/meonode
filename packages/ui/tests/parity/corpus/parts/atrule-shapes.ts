// At-rule shapes whose conditions hold or fail on purpose, for the
// atrule-shapes-* cases: three at-rules deep inside a sized named container at
// a viewport they match; at-rules inside selector blocks and selector blocks
// inside at-rules; @supports that holds and that does not; reduced motion and
// colour scheme (both emulated by the harness); @layer against unlayered
// rules; @starting-style under a transition, on mount and on a later mount;
// @scope with and without a limit; @keyframes running and paused; @font-face
// and @property, read through what they change; and vendor-prefixed
// declarations inside at-rules. Animated elements carry `data-parity-sample`,
// so the harness reads one fixed frame of them.
import { useState, type ReactElement } from 'react'
import { B, Button, Div, Node, Span } from '@meonode/ui'

/** The click that mounts the second @starting-style element. */
export const MOUNT_STARTING = '[data-act="mount-starting"]'

/** A transition long enough that the sampled frame is far from either end. */
const SLOW = 'background-color 1000s linear'
/** The sampled time, a quarter of the way through `SLOW`, in ms. */
const QUARTER = '250000'

/** An element that mounts with @starting-style on a click, after the page has loaded. */
function LaterStarting(): ReactElement {
  const [shown, setShown] = useState(false)
  return Div({
    children: [
      Button('mount', { key: 'mount', type: 'button', 'data-act': 'mount-starting', onClick: () => setShown(true) }),
      shown
        ? Div({
            key: 'starting-later',
            'data-parity-sample': QUARTER,
            css: { transition: SLOW, backgroundColor: 'rgb(200, 200, 200)', '@starting-style': { backgroundColor: 'rgb(0, 0, 0)' } },
            children: 'starting style, mounted later',
          })
        : null,
    ],
  } as never).render() as ReactElement
}

/** Every shape, side by side. */
export function AtruleShapes(): ReactElement {
  return Div({
    children: [
      // Three deep, all true: @supports, then @media, then @container on a 600px named container.
      Div({
        key: 'deep-container',
        containerType: 'inline-size',
        containerName: 'parity',
        width: 600,
        children: [
          Span('deep, true', {
            key: 'deep-true',
            css: { '@supports (display: grid)': { '@media (min-width: 600px)': { '@container parity (min-width: 300px)': { color: 'rgb(1, 0, 0)' } } } },
          }),
          Span('deep, last one false', {
            key: 'deep-false',
            css: { '@supports (display: grid)': { '@media (min-width: 600px)': { '@container parity (min-width: 2000px)': { color: 'rgb(2, 0, 0)' } } } },
          }),
          Span('container in media in selector', {
            key: 'deep-selector',
            css: { '&:not(.parity-none)': { '@media (min-width: 600px)': { '@container parity (max-width: 700px)': { textDecoration: 'underline' } } } },
          }),
        ],
      }),
      // At-rules inside selector blocks, and selector blocks inside at-rules.
      Div({
        key: 'nested-blocks',
        css: {
          '& > span': { '@media (min-width: 600px)': { '@supports (display: grid)': { color: 'rgb(3, 0, 0)' } } },
          '&:hover': { '@media (min-width: 1px)': { outlineOffset: '2px' } },
          '@media (min-width: 1px)': { '& > b': { '@supports (display: grid)': { color: 'rgb(4, 0, 0)' } }, '&:focus-within': { outlineOffset: '4px' } },
        },
        children: [Span('span child', { key: 's' }), B('b child', { key: 'b' })],
      }),
      // @supports that holds and that does not.
      Div({
        key: 'supports',
        css: {
          '@supports (display: grid)': { display: 'grid' },
          '@supports (display: parity-nothing)': { color: 'rgb(5, 0, 0)' },
          '@supports not (display: grid)': { fontStyle: 'italic' },
          '@supports selector(:has(a))': { outlineOffset: '5px' },
          '@supports (display: grid) and (not (display: parity-nothing))': { letterSpacing: '1px' },
        },
        children: 'supports',
      }),
      // Media features the harness emulates.
      Div({
        key: 'media-features',
        css: {
          '@media (prefers-reduced-motion: reduce)': { color: 'rgb(6, 0, 0)' },
          '@media (prefers-reduced-motion: no-preference)': { outlineOffset: '6px' },
          '@media (prefers-color-scheme: dark)': { backgroundColor: 'rgb(30, 30, 30)' },
        },
        children: 'media features',
      }),
      // @layer against unlayered rules on one node and from an ancestor.
      Div({
        key: 'layer-unlayered',
        css: { '@layer parity-low': { color: 'rgb(7, 0, 0)', fontStyle: 'italic' }, color: 'rgb(8, 0, 0)' },
        children: Span('layered child', { key: 's', css: { '@layer parity-low': { color: 'rgb(9, 0, 0)' } } }),
      }),
      // @starting-style under a transition, on the first render and in a selector block.
      Div({
        key: 'starting',
        'data-parity-sample': QUARTER,
        css: { transition: SLOW, backgroundColor: 'rgb(200, 200, 200)', '@starting-style': { backgroundColor: 'rgb(0, 0, 0)' } },
        children: 'starting style',
      }),
      Div({
        key: 'starting-selector',
        'data-parity-sample': QUARTER,
        className: 'open',
        css: { transition: SLOW, backgroundColor: 'rgb(0, 0, 200)', '&.open': { '@starting-style': { backgroundColor: 'rgb(0, 200, 0)' } } },
        children: 'starting style in a selector block',
      }),
      Node(LaterStarting, { key: 'later' }),
      // @scope, implicit, with a root, and with a limit.
      Div({
        key: 'scope',
        className: 'scope-root',
        css: {
          '@scope': { '& span': { color: 'rgb(10, 0, 0)' } },
          '@scope (.scope-root) to (.scope-limit)': { b: { color: 'rgb(11, 0, 0)' } },
        },
        children: [
          Span('in scope', { key: 's' }),
          B('b in scope', { key: 'b' }),
          Div({ key: 'limit', className: 'scope-limit', children: B('b past the limit', { key: 'b' }) }),
        ],
      }),
      // @keyframes, paused at a frame by CSS and running, sampled.
      Div({
        key: 'keyframes',
        css: {
          '@keyframes parity-pulse': { from: { color: 'rgb(0, 0, 0)' }, to: { color: 'rgb(0, 0, 240)' } },
          animation: 'parity-pulse 10s linear -2.5s paused',
        },
        children: 'keyframes, paused',
      }),
      Div({
        key: 'keyframes-sampled',
        'data-parity-sample': '7500',
        css: { '@keyframes parity-glow': { '0%': { opacity: 0 }, '100%': { opacity: 1 } }, animation: 'parity-glow 10s linear infinite' },
        children: 'keyframes, running',
      }),
      // Running animations the harness brings to a fixed frame: a finite one ends, held by its fill mode; an infinite one pauses partway.
      Div({
        key: 'animation-finite',
        css: { '@keyframes parity-grow': { from: { opacity: 0.2 }, to: { opacity: 0.8 } }, animation: 'parity-grow 2s linear forwards' },
        children: 'finite, forwards',
      }),
      Div({
        key: 'animation-infinite',
        css: { '@keyframes parity-turn': { from: { rotate: '10deg' }, to: { rotate: '50deg' } }, animation: 'parity-turn 3s ease-in infinite' },
        children: 'infinite',
      }),
      // @font-face, read through the width size-adjust gives the text.
      Span('font face', {
        key: 'font-face',
        css: { '@font-face': { fontFamily: 'parity-face', src: 'local("Arial")', sizeAdjust: '150%' }, fontFamily: 'parity-face', display: 'inline-block' },
      }),
      // @property: a registered non-inheriting length is the initial value on a child; unregistered, it would inherit.
      Div({
        key: 'property',
        css: {
          '@property --parity-length': { syntax: '"<length>"', inherits: 'false', initialValue: '7px' },
          '--parity-length': '3px',
          outlineOffset: 'var(--parity-length)',
        },
        children: Span('registered property child', { key: 's', css: { outlineOffset: 'var(--parity-length)' } }),
      }),
      // Vendor-prefixed pairs inside at-rules.
      Div({
        key: 'vendor',
        css: {
          '@media (min-width: 1px)': {
            userSelect: 'none',
            appearance: 'none',
            backdropFilter: 'blur(1px)',
            textSizeAdjust: '100%',
            maskImage: 'linear-gradient(black, transparent)',
          },
          '@supports (display: grid)': { '& > span': { userSelect: 'all', hyphens: 'auto' } },
        },
        children: Span('vendor', { key: 's' }),
      }),
    ],
  } as never).render() as ReactElement
}
