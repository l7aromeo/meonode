---
'@meonode/ui': patch
---

`StyleRegistry` no longer loses rules after a style whose text leaves a group open, or before one that must start a stylesheet (#160). A key with an unclosed `(`, such as `css: { '&:not(.a': { … } }`, is kept by Emotion as text whose `(` the browser reads to the end of the stylesheet, and a style that is an `@import` alone applies only where a stylesheet starts. In Emotion's own server render each element's rules get a `<style>` of their own, so neither reaches another element's rules. The registry joined a flush's styles into one `<style>`, where the rules after such a group were dropped and such an `@import` was ignored. It now starts a new `<style>` at those edges, and keeps one element everywhere else.
