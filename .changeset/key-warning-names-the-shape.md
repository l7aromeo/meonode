---
'@meonode/ui': patch
---

Say which shape produced a missing-key report.

The call-site line named where a generated list was written. When that list has
been spread in beside children written out by hand, the child React names is
usually one of those siblings — a heading has no key because nobody writes keys
on headings — while the rows, which do have keys, look like the problem. The
reader audits the rows.

When a marked list holds both keyed and unkeyed children, the line now says so
and names the fix, which is not the same fix as the all-unkeyed case:

```
[MeoNode] A generated list at app/page.tsx:41:7 has children without a `key`.
React reports the missing key itself; this names the call site it came from.
Some children here do have keys: a spread puts a generated list and the siblings
written beside it into one list, so React asks those siblings for keys too. Nest
the generated part instead of spreading it.
```

A list where nothing is keyed is left alone — there the fix is keys, and blaming
the spread would send the reader the wrong way.
