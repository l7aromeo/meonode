---
'@meonode/ui': minor
---

React Server Components: every server-compiled style now reaches the page, and host tags no longer ship their `css` in the flight payload.

- **Rules reach prerendered pages (#34).** A node whose `css` is compiled on the
  server into a class name got its class but not its rule when the page was
  statically prerendered, so it rendered unstyled. The rule now travels with the
  render that compiled it, as a `<style href precedence="meonode">` React hoists
  into the document head, so it arrives however the page is rendered:
  prerendered, streamed, or cached.
- **`createNode(next/link)` from a server component gets its rule (#32).** The
  link had its class and the browser's default link styles.
- **Each request keeps its own rules.** Server-compiled rules were queued in one
  process-wide list and flushed by whichever render drained it next, so a rule
  could land in another request's HTML, two requests rendering at once could each
  take part of the other's rules, and a prerendered page could carry the next
  page's rules instead of its own.
- **Host tags compile on the server (#34).** A `Div`, `Span`, `Button`, … with
  styles in a server component was rendered as a client component carrying its
  whole `css` object, so the styles reached the browser twice. It now renders as
  the element itself with a server-compiled class. `:hover`, media queries and
  theme tokens behave as before. A 200-row page's flight payload drops from
  55.1 KB to 24.5 KB. Host tags inside `'use client'` components are unchanged.
- **A `className` passed into a styled server component overrides its own
  `css`**, composed into one class as Emotion does on the client. Before, the
  element kept both classes and the winner depended on the order the rules
  reached the page. Classes meonode did not generate, such as utility classes,
  are kept as they are. This holds across a `'use cache'` boundary too: a class
  handed into a cached component is looked up in a bounded store of classes
  compiled for components (the most recently used 10,000 classes, at most 4 MiB
  of style text). A class that has left the store stays a separate class, and is
  reported once in development.
- **A render stays one element.** The `<style>` elements go into the children of
  the topmost host element above the node that uses them, after its own
  children, so the root of `.render()` is the element it would be without styles:
  a cloning parent (`Slot`, Radix `asChild`, `Children.only`) still receives it,
  and reordering siblings does not remount them. When nothing in a render can
  hold its rules, because the root is a void element such as `Img`, an `svg`, or
  a component with no host above the styled node, the root is returned as a
  Fragment of the element and its rules, and a cloning parent receives that
  Fragment. Pass the node rather than its rendered element to avoid it:

  ```ts
  const Link = createNode(NextLink)

  Node(Slot, { children: Link({ href: '/', color: 'red' }) }) // cloned
  Node(Slot, { children: Link({ href: '/', color: 'red' }).render() }) // Fragment
  ```

- **No crash on unrecognised children.** The `react-server` build of React
  exports no `Component`, and checking `instanceof React.Component` threw
  `TypeError: Right-hand side of 'instanceof' is not an object` for any child
  that reached it, including a `Promise`. Such children are now handed to React
  as written.
