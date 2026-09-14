---
'@meonode/ui': patch
---

Type `children` as the nesting the runtime already accepts.

2.2.0 let a `children` array contain arrays, and `Children` was never widened
with it:

```ts
export type Children = NodeElement | NodeElement[]
```

So the types permitted exactly the shape the runtime change exists to replace —
a spread — and rejected the one it enables:

```
error TS2322: Type '(NodeInstance<"span"> | NodeInstance<"span">[])[]' is not
assignable to type 'NodeElement<NodeElementType, Record<string, unknown>>[]'
```

It is now recursive, and its arrays are readonly so that an `as const` list is a
valid children list:

```ts
export type Children = NodeElement | readonly Children[]
```

`readonly` costs existing callers nothing — a mutable array is assignable to a
readonly one, and the patterns that read an array back out of a `Children` value
go through `Array.isArray`, which narrows to `any[]` either way. Checked against
the built `.d.ts` from a consumer project: mutating after a guard, returning one
as `NodeElement[]`, spreading one, and passing a `NodeElement[]` as children all
compile before and after; only the nested form changes answer.

The accompanying `.test-d.ts` is the part that was missing. Nesting was mutation
tested, RSC tested and measured for allocation, and still shipped unusable from
TypeScript, because every one of those tests exercises the feature from
JavaScript — where the annotation has no say.
