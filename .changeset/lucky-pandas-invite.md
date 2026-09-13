---
'@meonode/compiler': minor
---

Record at each call site whether its children were written out or generated.

React matches unkeyed children by position, so deleting or reordering a list
hands each surviving row the previous row's fiber — its state, its focus,
whatever the user had typed. React reports that; `@meonode/ui` could not,
because the decision cannot be made from the value. Arguments are evaluated
before the callee runs, so by the time `Div({ children })` is entered,
`items.map(fn)` has already collapsed into an ordinary array, indistinguishable
from one typed out by hand. Only the source still knows, which makes it the
compiler's question.

Call sites are now classified and the answer travels as `__meo$list: 1` on
schemas 2 and 3, absent when the children were authored. This is the same thing
React's own JSX transform does with its `isStaticChildren` flag, at the same
layer — not a heuristic.

The rule is inverted on purpose: a literal array of authored elements is
static, and everything else is generated. Enumerating the ways to produce
children has no end — `.map`, `.reduce`, `filter().map()`, `flatMap`,
`Array.from`, `Object.values().map()`, a `for` loop, a generator, an
immediately invoked function, a bare identifier, a helper call — while the
authored form has exactly one shape. Every one of those falls out with no rule
of its own, and the classifier stays exhaustive as the language grows idioms.

Three cases needed more than the shape of the expression:

- **Children-first factories.** `Span(rows, { padding: 8 })` passes children as
  argument 0, and `createChildrenFirstNode` merges them last, so they override
  any `children` in the props object. Reading the props object there was wrong
  in both directions: real lists went unreported, and a dead `children` prop was
  reported for children that never render. The source is now chosen by factory
  kind rather than argument position.
- **A props-less children-first call.** `Span(items.map(fn))` has nowhere to put
  the marker, so a props object is synthesized — gated on the children being
  generated, so a call's shape only changes where there is something to report.
- **A trailing spread.** `Div({ children: ['a'], ...rest })` is generated: the
  spread can replace `children`, so what renders is not what the call site
  wrote. A leading spread is not, since the written property wins.

`Div({ ...rest })` with no written `children` stays authored. A spread may carry
some, but marking every wrapper component would bury the real reports.
Documented as a known false negative rather than left implicit.

The README now states the runtime floor for each marker separately, because
they are different: schema 2 buckets from `@meonode/ui@1.7.0`, schema 3 from
`1.8.0` — not the `1.7.0` previously advertised, which has been wrong for
schema-3 output since `0.2.0` — and `__meo$list` from whichever release first
carries a `list` entry in its schema keys, which is none of them yet. A reader
is told to test that capability rather than a version number.
