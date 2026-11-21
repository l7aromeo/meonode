---
'@meonode/ui': patch
---

A nested array that appears more than once in one `children` array renders every time, as React renders it. It was dropped after the first time, with a false warning that the array contains itself. The warning now fires only for an array inside itself.
