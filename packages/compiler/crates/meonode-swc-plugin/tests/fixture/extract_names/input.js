import { Div } from "@meonode/ui";
// A static node: one name, the runtime's own, for its whole style.
Div({ padding: 8, css: { "&:hover": { color: "red" } } });
// The same style elsewhere shares the name and its registration.
Div({ padding: 8, css: { "&:hover": { color: "red" } } });
// Selectors naming the node twice match what Emotion's class matches.
Div({ css: { "& + &": { marginTop: 4 } } });
// A label adds Emotion's suffix to the name.
Div({ css: { label: "card", color: "red" } });
// One name per SWITCH combination, chosen at the call site.
export const a = (p) => Div({ color: p.on ? "red" : "blue", margin: p.on ? 1 : 2 });
// Past the cap of combinations, the node stays on the runtime path.
export const b = (p) => Div({ color: p.on ? "a" : "b", margin: p.on ? 1 : 2, padding: p.on ? 1 : 2, top: p.on ? 1 : 2, left: p.on ? 1 : 2 });
// A value only known at run time keeps the whole node on the runtime path.
export const c = (p) => Div({ padding: 8, color: p.color });
