---
'@meonode/ui': minor
---

Two different styles no longer share one class name. MeoNode now names each class from a SHA-256 of the style's whole text, in the browser, in server rendering and in React Server Components, where it used Emotion's 32-bit hash. A class name is now 13 base-36 characters after the cache key, for example `css-27fvjgatqmrja` where it was `css-1cqf8hq`, plus any label.

Class names change form, so snapshot tests that record MeoNode class names need updating. Class names are not a stable API and may change between versions. Classes that `@meonode/mui` and code using Emotion directly create keep Emotion's names, and never equal a MeoNode name.
