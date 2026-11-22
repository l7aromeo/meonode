---
'@meonode/ui': patch
---

A compiled call that sets a DOM prop to `undefined` now removes a factory's default for it, as the same call uncompiled does (#158). With `const X = createNode('div', { className: 'a' })`, `X({ className: undefined })` compiled by `@meonode/compiler` (a factory listed in `factoryModules`) rendered `class="a"`, while uncompiled it renders no class. The compiler moves the call's DOM props into its compiled bucket, and since 1.7.2 the runtime skipped the bucket's `undefined` entries, so the factory's value stayed. Any DOM prop a factory sets by default was affected (`id`, `title`, `aria-*`, `data-*`, `style`, handlers). Style props were not.
