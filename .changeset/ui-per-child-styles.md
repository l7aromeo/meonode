---
'@meonode/ui': minor
---

In the browser, a styled node now resolves its class where it renders, instead of through Emotion's `css` prop components. It renders its element beside a leaf that inserts the element's rule while the sheet lacks it, in the two places Emotion's own components render, so the elements a component receives, what remounts, `useId` and hydration are as before, and rules go into the sheet in the order of the tree. Server rendering is unchanged.

A styled node now takes 3 fibers on the mount that first inserts its rule and 2 after, where it took 4.

A chain of styled nodes now mounts 1,287 levels deep before the browser's stack runs out, where it mounted 857; under a `ThemeProvider` with different css on every level, 1,355, where it was 897; and with a component at every level, 875, where it was 648. Counted in Chrome 158 on the first mount of a fresh page.
