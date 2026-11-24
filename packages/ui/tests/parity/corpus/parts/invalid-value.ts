// A run-time value invalid for its property, for the invalid-value-* cases.
// Under a .dark ancestor each node sets margin-top from state in a `.dark &`
// block, and the page's own `div:hover` rule (INVALID_PAGE_CSS, lower
// specificity) sets margin-top: 1px. Uncompiled, Emotion writes
// `margin-top:blue`, which the browser drops at parse time, so under hover the
// lower rule applies (1px). Written as `margin-top:var(--x)` with `--x: blue`,
// the declaration is invalid at computed-value time and margin-top becomes its
// initial value instead (0px), whatever rule is below it. One node per way a
// value reaches the rule: a conditional (SWITCH), a template literal around
// one (VAR), and five independent conditions, more combinations than the
// exact design gives one node.
import { useState, type ReactElement } from 'react'
import { Button, Div } from '@meonode/ui'

/** The page's rule below each node's `.dark &` block. */
export const INVALID_PAGE_CSS = 'div:hover{margin-top:1px}'

/** The click that flips every condition. */
export const FLIP = '[data-act="flip-invalid"]'

export function InvalidValues(): ReactElement {
  const [on, setOn] = useState(false)
  const p = { on, a: on, b: !on, c: on, d: !on, e: on }
  return Div({
    className: 'dark',
    children: [
      Button('flip', { key: 'flip', type: 'button', 'data-act': 'flip-invalid', onClick: () => setOn(v => !v) }),
      Div({
        key: 'invalid-switch',
        'data-parity-force': '',
        css: { '.dark &': { color: p.on ? 'blue' : 'green', marginTop: p.on ? 'blue' : 'green' } },
        children: 'switch',
      }),
      Div({
        key: 'invalid-var',
        'data-parity-force': '',
        css: { '.dark &': { marginTop: `${p.on ? 'blue' : 'grid'}` } },
        children: 'template',
      }),
      Div({
        key: 'invalid-over-cap',
        'data-parity-force': '',
        css: {
          '.dark &': { color: p.a ? 'red' : 'blue', marginTop: p.b ? 'blue' : 'green', padding: p.c ? 1 : 2, width: p.d ? 100 : 200, height: p.e ? 10 : 20 },
        },
        children: 'five conditions',
      }),
    ],
  } as never).render() as ReactElement
}
