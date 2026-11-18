---
'@meonode/ui': patch
---

Build with webpack against a React that has no `Activity` export. A Next.js 15 app that builds with webpack, Next 15's default, failed as soon as it imported `@meonode/ui`, whether or not it used `Activity`: `Attempted import error: 'Activity' is not exported from 'react'`. Next 15 renders with its own React, a 19.2 canary without that export, and webpack checks each member read of a namespace import against the module's exports. `Activity` is now read in a way webpack does not check, and where React lacks it, the element type falls back to the registered symbol, which renders as `<Activity>`.

Fixes #89.
