import { Div, type CssProp } from '@meonode/ui'

/**
 * Emotion's serialized styles as `css`, holding a numeric spacing token under a
 * length property, and, when given, a keyframes value beside them. Rendered from
 * a server component and from a client component, which must agree on the class.
 *
 * `@emotion/react` cannot load in a server component, so each page serializes
 * its own: the server page with `@emotion/serialize`, which `css()` calls, and
 * the client page with `css()` and `keyframes()`.
 */
export function SerializedStylesTree({ testId, styled, keyframesValue }: { testId: string; styled: CssProp; keyframesValue?: CssProp }) {
  return Div({
    'data-testid': `${testId}-page`,
    children: [
      Div({ 'data-testid': testId, css: styled, children: 'serialized styles' }),
      keyframesValue === undefined ? null : Div({ 'data-testid': `${testId}-keyframes`, css: keyframesValue, children: 'keyframes value' }),
    ],
  })
}
