---
'@meonode/ui': patch
---

Keep a node's root a single element in a React Server Component when it carries CSS rules.

In a server component, the `<style>` elements for a render's server-compiled
rules go into the children of the topmost host element that can hold them, after
its own children. The root of `.render()` is still exactly the element it would be
without styles, so a parent that clones its child — a `Slot`, a Radix
`asChild`, a `Children.only` — still receives that element, and its type does
not change between renders, so reordering siblings does not remount them.

When nothing in a render can hold the rules — its root is a void element such as
`Img`, an `svg`, or a component with no host element above the styled node —
the root is returned as a Fragment of the element and its rules instead. A
cloning parent then receives the Fragment, not the element. Pass the node rather
than its rendered element to avoid this:

```ts
const Link = createNode(NextLink)

Node(Slot, { children: Link({ href: '/', color: 'red' }) }) // cloned
Node(Slot, { children: Link({ href: '/', color: 'red' }).render() }) // Fragment
```
