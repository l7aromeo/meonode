---
'@meonode/ui': patch
---

A `styles` key in `css` that holds anything but a string is now left out, at any depth, and the rest of that object renders. Emotion reserves `styles` for serialized styles, such as what `css()` returns, and wrote such an object from the key alone: its development build crashed the render, and in production the element got a `css-undefined` class with no rule, so none of the object's other declarations applied. Production now renders them.

Development reports the key once, naming where it sits, such as `` `css["&:hover"]` has a `styles` key that holds no string ``. Production stays silent.

Refs #88.
