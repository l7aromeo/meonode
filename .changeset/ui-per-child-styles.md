---
'@meonode/ui': minor
---

In the browser, a styled node now resolves its class where it renders, instead of through Emotion's `css` prop components. It renders its element beside a leaf that inserts the element's rule while the sheet lacks it, in the two places Emotion's own components render, so the elements a component receives, what remounts, `useId` and hydration are as before, and rules go into the sheet in the order of the tree. Server rendering is unchanged.

A styled node now takes 3 fibers on the mount that first inserts its rule and 2 after, where it took 4.

It is faster on a page's first load and more so after. In Chrome 158, an app-shaped tree of about 10k nodes, with theme tokens, two providers and css that differs on every node, mounts on a fresh page in 111.5 ms, where it took 117.3 (−5.6 ± 1.1 ms, −4.8%), and mounts again in 43.0 ms, where it took 51.6 (−8.7 ± 0.7 ms, −16.8%); 10k styled spans under a `ThemeProvider` mount again in 41.2 ms, where they took 48.2 (−7.3 ± 0.6 ms, −15.0%). Over React setting a static `className`, a styled node now adds 2.87 µs to a mount, where it added 3.72; a nested level 2.36 µs, where it added 3.41; and a row whose colour changes 2.20 µs per update, where it added 2.78. Each ± is the resolution the README's performance section defines.

A chain of styled nodes now mounts 1,287 levels deep before the browser's stack runs out, where it mounted 857; under a `ThemeProvider` with different css on every level, 1,355, where it was 897; and with a component at every level, 875, where it was 648. Counted in Chrome 158 on the first mount of a fresh page.
