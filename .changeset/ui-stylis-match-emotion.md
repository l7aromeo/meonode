---
'@meonode/ui': patch
---

Depends on `stylis` 4.2.0, the exact release `@emotion/cache` 11.14.0 pins, instead of `^4.4.0`. An app now installs and bundles one copy of stylis rather than two. That holds with bun, npm and pnpm, including an app whose lockfile already resolved 4.4.0 for `@meonode/ui` (Fixes #136).

The rule written for a server component's css key holding a theme token is now compiled by Emotion's own cache, so it is what Emotion writes for the same css:
- a `label` is left out;
- a pseudo selector after a comma attaches to the element: `'&:hover, :focus'` writes `.x:focus`, where it wrote the descendant selector `.x :focus`;
- a custom property with an empty value is left out.
