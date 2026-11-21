---
'@meonode/ui': minor
---

Experimental: the runtime side of build-time css extraction. Compiled output can register a module's extracted rules with `registerStaticCss` and set the values of their CSS variables with `toCssValue`, both exported from every entry. A node whose styles were all extracted renders a plain element with the static classes and variables merged before its own `className` and under its own `style`, without Emotion or a theme hook. A node with css left over renders as today, with the static classes added. At a call site with one spread, the node keeps its static classes unless the spread brings a CSS key, `css`, `as` or `theme`; then it renders as the call site would uncompiled. In the browser, the rules go into four bucket sheets placed before Emotion's. A server render sends the rules its nodes use as React hoistable styles, once per request, and the browser does not insert again what the server sent. Output without the new markers renders exactly as before.
