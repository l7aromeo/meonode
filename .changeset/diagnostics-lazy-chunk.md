---
'@meonode/ui': patch
---

A production build no longer carries MeoNode's development diagnostics in the code a page loads first ([#134](https://github.com/l7aromeo/meonode/issues/134)). They are in a chunk of their own, which `setDebugMode(true)` loads; the checks made before it arrives are held, up to 60,000, and run in the order they were made once it does. Development builds are unchanged: every check still runs where it is made.

webpack (and Next.js with it), Turbopack, Rollup, Rolldown (and Vite 8 with it) and Bun split the diagnostics out. esbuild keeps them in the first load, and so does a Vite `manualChunks` that assigns MeoNode's modules to a chunk, by package or as one `vendor` chunk; there the first load is about 1.6 KB gzipped larger than before. The README's Debug Mode section gives a `manualChunks` that leaves `@meonode/*` to Vite. In the apps measured, first-load JavaScript is 1.7 KB gzipped smaller with Next.js 16 and Turbopack, 4.3 KB with Next.js 16 and webpack, and 3.6 KB with Vite 8.

The 3.3.0 note for the unkeyed-list report ([#108](https://github.com/l7aromeo/meonode/issues/108)) said its code, about 1.5 KB gzipped, ships in the browser bundle. It was about 1.2 KB, as the README measured; with the bundlers above it is now loaded only when debug mode is turned on.
