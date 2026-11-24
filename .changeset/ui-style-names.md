---
'@meonode/ui': minor
---

Two different styles no longer share one class name (Fixes #143). MeoNode now names each class from a SHA-256 of the style's whole text, in the browser, in server rendering and in React Server Components, where it used Emotion's 32-bit hash. A class name is now 13 base-36 characters after the cache key, for example `css-27fvjgatqmrja` where it was `css-1cqf8hq`, plus any label.

Class names change form, so snapshot tests that record MeoNode class names need updating. Class names are not a stable API and may change between versions. Classes that `@meonode/mui` and code using Emotion directly create keep Emotion's names, and never equal a MeoNode name.

MeoNode serializes styles with its own copy of Emotion's `serializeStyles` (Fixes #167). The copy writes the same text, labels and keyframes as Emotion's, and skips the 32-bit hash Emotion computes for a name MeoNode replaces, so every styled render does less work.

Naming a style costs more the first time it is seen. In Chrome, against the same runtime serializing and naming styles with Emotion's `serializeStyles` and hash, a page of about 10,000 styled nodes, each with its own style, mounts ⟨…⟩ the first time; later mounts take ⟨…⟩ and updates ⟨…⟩. Names are kept for up to 40,000 styles, about 9.4 MiB at most for typical styles.
