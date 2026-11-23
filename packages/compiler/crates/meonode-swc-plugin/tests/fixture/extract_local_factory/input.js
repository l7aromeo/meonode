import { createChildrenFirstNode, createNode } from "@meonode/ui";
// Flat and css defaults, merged with the call's flat and css.
const Card = createNode("div", { background: "red", padding: 4, css: { "&:hover": { color: "blue" } } });
Card({ color: "white", padding: 8, children: "Hi" });
Card({ css: { "&:hover": { color: "green", background: "theme.surface" }, margin: 1 } });
Card({ children: "no own styles" });
Card({ css: undefined, color: "black" });
// DOM defaults join the call's DOM props, in the merged order.
const Pane = createNode("aside", { "data-pane": true, "aria-label": "Details", width: "theme.layout.inspector", tabIndex: -1 });
Pane({ "aria-label": "Facts", id: "facts", padding: 2 });
// className is replaced by the call's.
const Labelled = createNode("span", { className: "base", color: "red" });
Labelled({ className: "own" });
Labelled({ fontSize: 12 });
// Children-first: the call's children win, the defaults' never survive.
const Title = createChildrenFirstNode("h2", { children: "default", margin: 0, fontWeight: 600 });
Title("Heading", { margin: "0 0 8px" });
// No initial props: a host factory.
const Box = createNode("div");
Box({ padding: 1 });
// Composition the runtime does not merge: left to it.
Card({ css: "color: red;" });
// Not literal defaults, a styles key, a blocking prop: left to the runtime.
const Dynamic = createNode("div", { padding: size });
Dynamic({ color: "red" });
const Reserved = createNode("div", { css: { color: "red", styles: { margin: 1 } } });
Reserved({ padding: 1 });
const Themed = createNode("div", { theme: { mode: "dark" }, padding: 1 });
Themed({ color: "red" });
// A component target is not a host.
const Wrapped = createNode(Component, { padding: 1 });
Wrapped({ color: "red" });
// A component selector in the defaults' css is not a map the runtime merges.
const Selected = createNode("div", { css: { __emotion_styles: "x", color: "red" } });
Selected({ padding: 1 });
// A token in a DOM default is written as a call's own DOM token is.
const Tipped = createNode("div", { title: "theme.primary", padding: 1 });
Tipped({ color: "red" });
Tipped({ title: "theme.primary", color: "blue" });
// Defaults holding the compiler's own marker keys, an integer-like key, or a number
// with no exact text: left to the runtime.
const Marked = createNode("div", { __meo$: 2, padding: 1 });
Marked({ color: "red" });
const Indexed = createNode("div", { 0: "x", padding: 1 });
Indexed({ color: "red" });
const Huge = createNode("div", { opacity: 1e999, padding: 1 });
Huge({ color: "red" });
const NestedIndex = createNode("div", { css: { "1": { color: "red" } }, padding: 1 });
const StringIndex = createNode("div", { "2": "two", padding: 1 });
StringIndex({ color: "blue" });
NestedIndex({ color: "blue" });
const HugeAttr = createNode("div", { "data-n": 1e999, padding: 1 });
HugeAttr({ color: "red" });
