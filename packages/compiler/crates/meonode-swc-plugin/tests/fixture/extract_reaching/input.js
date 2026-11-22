import { Div } from "@meonode/ui";
// Later elements only: one rule in the reaching bucket.
Div({ css: { "& > *": { color: "red" } } });
// The node and an earlier element: one rule in the per-node bucket.
Div({ css: { ".dark &": { color: "white" }, ".x:has(&)": { color: "blue" } } });
// Both: one class in each bucket, nested rules split by where they reach.
Div({ css: { ".dark &": { color: "red", "& .x": { color: "green" } }, "& + .y": { margin: 0 } } });
// A list reaching both sides of the node stays on the runtime path.
Div({ css: { "&, & p": { color: "red" } } });
// An element that may render on either side stays on the runtime path.
Div({ css: { ".x:has(&) p": { color: "red" } } });
