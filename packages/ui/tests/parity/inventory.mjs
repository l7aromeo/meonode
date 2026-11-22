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
  'value.custom-property': 'custom properties set and read through var(): inherited, with fallbacks, registered, following state, overridden, inline and as a node prop',
  'value.omitted': 'null, undefined and false values, which render nothing',
  'value.keyframes': 'an animation using keyframes',
  'value.theme-fn-top': 'a theme function as a property value',
  'value.theme-fn-nested': 'a theme function inside a nested selector',
  'value.theme-fn-object': 'a theme function returning an object of declarations',
  'value.theme-fn-mode': 'a theme function that reads the mode',
  'value.runtime': 'a runtime value (state, prop) in a known property',
  'value.sizing-keyword': 'an intrinsic sizing keyword (fit-content, max-content) arriving at runtime in a sizing property, which Emotion prefixes and a variable does not',
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
  'place.spread': 'a props spread at a host call site',
  'place.not-css-prop': 'a top-level key that is not a CSS property (a --custom name), which goes to the element as a DOM prop',
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
  'sel.not': ':not, in every position and nesting',
  'sel.chain-long': 'long chains of classes, attributes, pseudo-classes and a pseudo-element on one compound',
  'at.media': '@media',
  'at.container': '@container',
  'at.supports': '@supports',
  'at.nested': 'at-rules nested in at-rules or selectors',
  'at.token-in-key': 'a theme token in an at-rule key',
  'at.prefers-color-scheme': '@media (prefers-color-scheme)',
  'at.prefers-reduced-motion': '@media (prefers-reduced-motion), under emulation',
  'at.supports-false': '@supports with a condition that does not hold',
  'at.deep': 'an at-rule in an at-rule in an at-rule, and at-rules in nested selector blocks',
  'at.layer': '@layer, against other layers, unlayered rules and the page',
  'at.scope': '@scope',
  'at.starting-style': '@starting-style with a transition, sampled',
  'at.keyframes': '@keyframes used by an animation, sampled',
  'at.font-face': '@font-face used by a font family',
  'at.property': '@property, read through the registered value',
  'at.vendor': 'vendor-prefixed pairs inside at-rules',
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

/**
 * Every compiler route, by id. `runtime:*` are the reasons an entry, a node or
 * a module stays on today's path, one id per reason the compiler documents.
 */
export const ROUTES = {
  STATIC: 'extracted: a literal, a token string or a same-file top-level const literal',
  SWITCH: 'extracted: a conditional whose branches are all static (including && with a boolean left side)',
  VAR: 'extracted with var(--mv-*): a runtime value in a known property',
  // Not a host call site: the whole node.
  'runtime:component-target': 'a component target (Node(Card, …))',
  'runtime:local-factory': 'a factory made in the module (createNode) or listed in factoryModules',
  'runtime:untraced': 'a call site whose factory is chosen at runtime',
  'runtime:spread': 'a call site with a props spread',
  'runtime:node-prop': 'a node with the as, theme or disableEmotion prop',
  // The css prop's own shape: the whole node.
  'runtime:css-not-literal': 'css that is an identifier or a call',
  'runtime:css-spread-computed': 'a css object with a spread or a computed key at its top level',
  'runtime:css-label-styles': 'a label or styles key in the node\'s own css',
  // Values: the entry.
  'runtime:dynamic-value': 'a value from a let, an import, a parameter, a member read or a call',
  'runtime:theme-fn': 'a theme function',
  'runtime:array-value': 'an array value (fallbacks)',
  'runtime:logical': '||, ?? or && whose left side is not provably boolean',
  'runtime:var-prefixed': 'a runtime value in a property the prefixer rewrites (sizing properties excepted)',
  'runtime:stylis-unsafe': 'a value stylis would parse differently (; { } : & @ \\, a comment, a newline)',
  // Order-dependent combinations: the property.
  'runtime:overlap-one-context': 'shorthand beside longhand, or logical beside physical, in one context',
  'runtime:multi-context': 'one property in two or more non-base contexts',
  'runtime:overlap-runtime': 'a property overlapping one already on the runtime path',
  'runtime:partial-layout': 'display, overflow*, flex* and min-* on a node with anything left on the runtime path',
  // At-rules and selectors.
  'runtime:at-rule-other': 'an at-rule other than @media, @supports and @container',
  'runtime:at-rule-token': 'a theme token in an at-rule key',
  'runtime:selector-unsupported': 'a ::placeholder, :read-only or :read-write selector',
  'runtime:node-free-selector': 'a selector that can match without the node (& only inside :not, :is or :where), which keeps the whole node',
  'runtime:self-reference': 'a selector naming & more than once in one list item (& + &, & &, &&), which keeps the whole node',
  'runtime:selector-list-mixed-reach': 'a selector list styling the node and an element rendered after it (&, .x), whose block stays on the runtime path',
  'runtime:selector-block-mixed': 'per-node selector blocks with a non-static entry, or a property shared with a static pseudo rule',
  // The module.
  'runtime:module-skip': 'a script rather than an ES module, or one that already uses __meoCss or __meoVal',
}

/** The routes that extract; every other route stays on the runtime path. */
export const EXTRACTED_ROUTES = ['STATIC', 'SWITCH', 'VAR']

/**
 * The gate: every shape and every route has a case, every route is proven on
 * a node by some case's routing, and every case names only known shapes and
 * routes.
 * @param cases Each case's name and meta.
 * @returns The problems found; empty when the corpus covers the inventory.
 */
export function coverageProblems(cases) {
  const problems = []
  const shapes = new Map(Object.keys(SHAPES).map(id => [id, []]))
  const routes = new Map(Object.keys(ROUTES).map(id => [id, []]))
  const proven = new Set()
  for (const { name, meta } of cases) {
    if (!meta?.shapes?.length) problems.push(`${name}: no shapes`)
    if (!meta?.routes?.length && !meta?.generatedFrom) problems.push(`${name}: no routes`)
    for (const id of meta?.shapes ?? []) {
      if (!shapes.has(id)) problems.push(`${name}: unknown shape ${id}`)
      else shapes.get(id).push(name)
    }
    for (const id of meta?.routes ?? []) {
      if (!routes.has(id)) problems.push(`${name}: unknown route ${id}`)
      else routes.get(id).push(name)
    }
    for (const { node, route } of meta?.routing ?? []) {
      if (!meta.routes?.includes(route)) problems.push(`${name}: node ${node} proves route ${route}, which the case is not tagged with`)
      else proven.add(route)
    }
  }
  for (const [id, names] of shapes) if (names.length === 0) problems.push(`shape ${id} has no case`)
  for (const [id, names] of routes) {
    if (names.length === 0) problems.push(`route ${id} has no case`)
    else if (!proven.has(id)) problems.push(`route ${id} is not proven on a node by any case's routing`)
  }
  return problems
}
