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

The explanation no longer waits for a line number. The call site needs the
plugin's `callSiteLocations` option, which most builds do not set; the shape
needs only the list marker, which every compiled build emits. So a build without
locations now gets the clause, plus a line saying which option would name the
file:

```
[MeoNode] A generated list has children without a `key`. Some children here do
have keys: a spread puts a generated list and the siblings written beside it
into one list, so React asks those siblings for keys too. Nest the generated
part instead of spreading it. Turn on `callSiteLocations` in the
@meonode/compiler plugin options to have this name the file and line.
```

Without a location, only the mixed case speaks. React already reports an
all-unkeyed list correctly, and repeating that with no line number is noise.

A list where nothing is keyed is left alone — there the fix is keys, and blaming
the spread would send the reader the wrong way.
