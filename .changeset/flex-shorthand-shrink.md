---
'@meonode/ui': patch
---

Stop the default `flex-shrink: 0` from overriding the `flex` shorthand.

A node that set `flex: '1 1 auto'` had `flex-shrink: 0` emitted after the
shorthand, so it never shrank: a truncating label in a flex row pushed its
siblings past the container edge instead of ellipsizing. Only numbers and the
`none`, `auto` and `initial` keywords were read; every multi-value shorthand fell
through to the layout defaults.

The shorthand is now parsed by the CSS grammar — one value (a number is the grow
factor, anything else the basis), `<grow> <shrink>`, `<grow> <basis>`,
`<grow> <shrink> <basis>`, and the basis-first orders — and its shrink factor is
used. A shorthand that cannot be read with certainty, such as `var(--flex)` or
`inherit`, gets no default `flex-shrink` at all, so the browser applies it as
written.

Behaviour change: `flex: 0` (number or string) now emits `flex-shrink: 1`
instead of `0`. CSS reads `flex: 0` as `0 1 0%`, so the old default overrode the
author the same way; a zero slipped past because the check was a truthiness
test. A node that relied on `flex: 0` not shrinking should set `flex: '0 0 0%'`
or `flexShrink: 0`.

`flex: 1`, `auto`, `none`, `initial`, an explicit `flexShrink`, and the defaults for
flex containers and plain flex items emit exactly what they did before.
