---
'@meonode/compiler': patch
---

The README's measured effect is re-measured against the current `@meonode/ui`: node construction 3.06–3.16x faster compiled, a client render 1.11–1.16x (1.18–1.19x with a token in every style value), and an end-to-end server render 1.32–1.39x with the theme rewrite and 1.15–1.18x with partitioning only, over three runs each. It read ~1.7x, ~1.06x and ~1.4x, measured against older runtimes and under heavy load.
