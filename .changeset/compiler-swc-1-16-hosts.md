---
'@meonode/compiler': minor
---

Load in current hosts: Next.js 16.4 and later, and `@swc/core` 1.16 and later.

`@swc/core` 1.16 changed how the host hands a program to an swc plugin, so 0.9.0
stopped the build in those hosts with "Failed to deserialize program received from
host". That includes Vite projects whose `@vitejs/plugin-react-swc` resolves
`@swc/core` 1.16, which a fresh install does. 0.10.0 is built for the new hosts, and
for that reason it no longer loads in the old ones:

| Your host | Use |
|---|---|
| Next.js 16.4 or later, or `@swc/core` 1.16 or later | `@meonode/compiler` 0.10 |
| Next.js 16.3 or earlier, or `@swc/core` 1.15 | `@meonode/compiler` 0.9 |

A `^0.9.0` range does not install 0.10.0, so nothing changes until you move it. Move
it in the same change that moves your host. In a Vite project, check that the
`@swc/core` your lockfile resolves (`npm ls @swc/core`) is 1.16 or later.
