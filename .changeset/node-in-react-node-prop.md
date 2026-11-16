---
'@meonode/ui': patch
---

A node now renders wherever a component renders what it is given, not only in `children`. Fixes #51.

You can pass a node as a Suspense `fallback`, in a component's slot prop such as an icon or a footer, as what a render prop returns, or inside a nested prop object, and the component renders it. Before, React threw "Objects are not valid as a React child" there, and a node handed from a server component to a client component failed with "Only plain objects … can be passed to Client Components". This works on the client, in server rendering and across the server-to-client boundary. A component that takes the node itself, to call its `render()` or pass it on, still receives the node.

Where a component prop is typed `ReactNode`, its type now accepts a node too, so `Suspense({ fallback: Div({ children: 'Loading…' }) })` type-checks. A render prop's return type and a nested object's fields keep their declared types. Props typed narrower than `ReactNode`, such as `ReactElement`, are unchanged, and a node in an HTML attribute still throws, as before.

In development, React can report a missing key once for a node given as a positional child when a transition render pauses between that child's parent and the child itself. The page renders correctly; only the warning is spurious.
