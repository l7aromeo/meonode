---
'@meonode/ui': patch
---

A server-rendered rule written after a nested `@import` is no longer lost (#160). Emotion's production build writes `css: { '@import url(x)': { … } }` as the statement `@import url(x)` with no `;`. Where the text it sits in ends, so does the statement. But `StyleRegistry` joins a flush's styles into one `<style>`, and React joins the `<style href precedence>` rules of server components into one element. There the statement ran on into the next rule's block, and the browser dropped that rule along with it. Each style's text now ends where a statement can end, so the next rule stands alone; the `@import` itself stays as Emotion writes it, and the browser ignores it as before.
