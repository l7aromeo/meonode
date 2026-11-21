// The styling shapes and compiler routes the parity corpus must cover, and the
// gate that fails a run when any of them has no case.
//
// The shapes are the inventory in the hybrid styling design: every way a
// developer writes styles today. The routes are the compiler's decisions per
// css entry (hybrid-interface.md), with each reason an entry stays on the
// runtime path listed separately, so a fallback reason without a case is a gap
// too.

/** Every styling shape, by id, with what it means. */
export const SHAPES = {
  // Values
  'value.number-length': 'a number in a length property, which gains px',
  'value.number-unitless': 'a number in a unitless property (opacity, flexGrow, zIndex, lineHeight)',
  'value.number-dual': 'a numeric token in a length property, which takes the --len variant',
  'value.string': 'a plain string value',
  'value.template-static': 'a template literal with no runtime parts',
  'value.template-runtime': 'a template literal with runtime parts',
  'value.token': 'a theme.* token string alone',
  'value.token-composite': 'a token inside a composite value (border shorthand, calc)',
  'value.fallback-array': 'a fallback array of values for one property',
  'value.important': 'a value with !important',
  'value.custom-property': 'a --custom property',
  'value.omitted': 'null, undefined and false values, which render nothing',
  'value.keyframes': 'an animation using keyframes',
  'value.theme-fn-top': 'a theme function as a property value',
  'value.theme-fn-nested': 'a theme function inside a nested selector',
  'value.theme-fn-object': 'a theme function returning an object of declarations',
  'value.theme-fn-mode': 'a theme function that reads the mode',
  'value.runtime': 'a runtime value (state, prop) in a known property',
  // Placement
  'place.style-props': 'style props at the top level of a factory call',
  'place.css': 'the css prop',
  'place.props-escape': 'the props: {} escape hatch for a name that is also a CSS property',
  'place.style-attr': 'the style attribute beside style props',
  'place.classname-merge': 'a className given beside styles',
  'place.as': 'the as prop swapping the element',
  'place.component-target': 'Node(Component, styleProps)',
  'place.create-node': 'createNode with default styles merged with call-site styles',
  'place.built-children': 'built elements passed as children',
  'place.mui': 'an @meonode/mui component with styles',
  'place.disable-emotion': 'disableEmotion on a subtree',
  // Selectors
  'sel.pseudo-class': 'pseudo-classes (:hover, :focus, :focus-visible, :active, :disabled)',
  'sel.pseudo-element': '::before and ::after',
  'sel.chained': 'chained pseudo-class and pseudo-element (&:hover::after)',
  'sel.self-class': '&.x',
  'sel.self-attr': '&[attr]',
  'sel.descendant': 'a descendant combinator (& p)',
  'sel.child': 'a child combinator (& > p)',
  'sel.sibling': 'sibling combinators (& + p, & ~ p)',
  'sel.ancestor': 'an ancestor context (.x &, [data-theme=dark] &)',
  'sel.comma': 'a comma list of selectors',
  'sel.where-is-has': ':where, :is and :has',
  'at.media': '@media',
  'at.container': '@container',
  'at.supports': '@supports',
  'at.nested': 'at-rules nested in at-rules or selectors',
  'at.token-in-key': 'a theme token in an at-rule key',
  'at.prefers-color-scheme': '@media (prefers-color-scheme)',
  // Dynamics
  'dyn.state': 'styles that follow component state',
  'dyn.conditional': 'a conditional value whose branches are static',
  'dyn.key-toggle': 'a style key present, then absent',
  'dyn.list-reorder': 'a keyed list reordered',
  'dyn.keyed-remount': 'a keyed remount',
  'dyn.deps-memo': 'a node with deps (memo)',
  'dyn.context': 'styles from React context',
  'dyn.suspense-lazy': 'Suspense and lazy',
  'dyn.transition': 'a transition update',
  'dyn.mutated-object': 'a css object mutated in place between renders',
  'dyn.mode-switch': 'a theme mode switch',
  'dyn.nested-providers': 'nested and sibling ThemeProviders',
  // Environments the corpus runs in
  'env.client-only': 'a client render with no server HTML',
  'env.ssr-hydrate': 'server HTML, then hydration',
  'env.streaming': 'a streamed server render',
  'env.rsc': 'a server component render',
}

/** Every compiler route, by id. `runtime:*` are the reasons an entry stays on today's path. */
export const ROUTES = {
  STATIC: 'extracted: literal, token string or same-file const',
  SWITCH: 'extracted: a conditional whose branches are all static',
  VAR: 'extracted with var(--mv-*): a runtime value in a known property',
  'runtime:theme-fn': 'a theme function',
  'runtime:call': 'a value from a call',
  'runtime:computed-key': 'a computed key',
  'runtime:at-rule-token': 'a token inside an at-rule key',
  'runtime:keyframes': 'a keyframes value',
  'runtime:spread': 'a call site with a props spread',
  'runtime:component-target': 'a component target (Node(Card, …))',
  'runtime:uncompiled': 'a call site the compiler does not compile',
}

/**
 * The gate: every shape and every route has a case, and every case names only
 * known shapes and routes.
 * @param cases Each case's name and meta.
 * @returns The problems found; empty when the corpus covers the inventory.
 */
export function coverageProblems(cases) {
  const problems = []
  const shapes = new Map(Object.keys(SHAPES).map(id => [id, []]))
  const routes = new Map(Object.keys(ROUTES).map(id => [id, []]))
  for (const { name, meta } of cases) {
    if (!meta?.shapes?.length) problems.push(`${name}: no shapes`)
    if (!meta?.routes?.length) problems.push(`${name}: no routes`)
    for (const id of meta?.shapes ?? []) {
      if (!shapes.has(id)) problems.push(`${name}: unknown shape ${id}`)
      else shapes.get(id).push(name)
    }
    for (const id of meta?.routes ?? []) {
      if (!routes.has(id)) problems.push(`${name}: unknown route ${id}`)
      else routes.get(id).push(name)
    }
  }
  for (const [id, names] of shapes) if (names.length === 0) problems.push(`shape ${id} has no case`)
  for (const [id, names] of routes) if (names.length === 0) problems.push(`route ${id} has no case`)
  return problems
}
