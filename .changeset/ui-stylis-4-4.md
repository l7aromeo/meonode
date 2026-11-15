---
'@meonode/ui': patch
---

Depend on `stylis` `^4.4.0` instead of `^4.2.0`.

A fresh install of 3.1.3 already resolves stylis 4.4.0 from the old range, so nothing changes for most projects; this makes 4.4.0, which the test suite now runs against, the lowest version installed.
