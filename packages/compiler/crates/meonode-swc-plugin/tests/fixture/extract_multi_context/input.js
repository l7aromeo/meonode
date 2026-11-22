import { Div } from "@meonode/ui";
// Different specificities: either order is kept.
Div({ css: { "&:hover:focus": { color: "red" }, "&:hover": { color: "blue" } } });
// Equal specificity, source order already the buckets' (pseudo, then at-rule).
Div({ css: { "&:hover": { color: "red" }, "@media (min-width: 1px)": { "&:hover": { color: "blue" } } } });
// The same pair in the opposite order: runtime.
Div({ css: { "@media (min-width: 1px)": { "&:hover": { color: "blue" } }, "&:hover": { color: "red" } } });
// Equal specificity in one bucket: runtime.
Div({ css: { "&:hover": { color: "red" }, "&:focus": { color: "blue" } } });
Div({ css: { "@media (min-width: 1px)": { color: "red" }, "@supports (display: grid)": { color: "blue" } } });
// `:where()` adds nothing, as an at-rule's own declarations: in bucket order.
Div({ css: { "&:where(.x)": { color: "red" }, "@media (min-width: 1px)": { color: "blue" } } });
Div({ css: { "@media (min-width: 1px)": { color: "blue" }, "&:where(.x)": { color: "red" } } });
// An object's own declarations come before its nested rules, wherever written.
Div({ css: { "&:hover": { "@media (min-width: 1px)": { color: "blue" }, color: "red" } } });
// Overlapping properties, not only the same one.
Div({ css: { "&:hover": { margin: 1 }, "@media (min-width: 1px)": { "&:hover": { marginTop: 2 } } } });
Div({ css: { "@media (min-width: 1px)": { "&:hover": { marginTop: 2 } }, "&:hover": { margin: 1 } } });
// A specificity it cannot tell counts as equal.
Div({ css: { "&::part(label)": { color: "red" }, "@media (min-width: 1px)": { "&::part(label)": { color: "blue" } } } });
Div({ css: { "@media (min-width: 1px)": { "&::part(label)": { color: "blue" } }, "&::part(label)": { color: "red" } } });
