---
'@meonode/ui': minor
---

In development, an unkeyed list generated at runtime is now reported without `@meonode/compiler`. When one call site hands over `children` lists without keys of different lengths, MeoNode warns once, naming the call site, because React never asks a MeoNode list for keys. A list whose length never changes during the session is not detected; the compiler still reports those. Production builds are unchanged.
