import { Button, Div, Span } from "@meonode/ui";
import { Slot } from "@/slot";
import { Card } from "./nodes";
import { base, fx, props, rest, theme } from "@/css";
// Joined already: a literal style (a sole child too), no style, a props-first
// call, a return.
export const childrenFirstLiteral = () => Button([Slot({ key: "icon", color: "red" })], { type: "button", css: { color: "blue" } });
export const childrenFirstSoleChildLiteral = () => Button(Slot({ key: "icon", color: "red" }), { type: "button", css: { color: "blue" } });
export const childrenFirstNoStyle = () => Button([Slot({ key: "icon", color: "red" })], { type: "button" });
export const propsFirstCssSpread = () => Div({ css: { ...base }, children: [Slot({ key: "icon", color: "red" })] });
export const returned = () => Slot({ key: "icon", color: "red" });
// A host child is named whatever the parent's style.
export const hostChildOfChildrenFirstCssSpread = () => Button([Span("x", { key: "a", color: "red" })], { type: "button", css: { ...base } });
// Joined: a children-first call's children are in node position whatever the
// call's own style: a spread or a call in `css`, a CSS prop read at run time,
// a sole child.
export const childrenFirstCssSpread = () => Button([Slot({ key: "icon", color: "red" })], { type: "button", css: { ...base } });
export const childrenFirstCssCallSpread = () => Button([Slot({ key: "icon", color: "red" })], { type: "button", css: { ...fx() } });
export const childrenFirstPropCall = () => Button([Slot({ key: "icon", color: "red" })], { type: "button", color: fx() });
export const childrenFirstSoleChild = () => Button(Slot({ key: "icon", color: "red" }), { type: "button", css: { ...base } });
// Or props the runtime refuses to join over, a spread or a computed key.
export const childrenFirstAs = () => Button([Slot({ key: "icon", color: "red" })], { as: "a" });
export const childrenFirstTheme = () => Button([Slot({ key: "icon", color: "red" })], { theme });
export const childrenFirstPropsSpread = () => Button([Slot({ key: "icon", color: "red" })], { ...props });
export const childrenFirstComputedKey = () => Button([Slot({ key: "icon", color: "red" })], { [fx()]: 1 });
// Through nested arrays, nested children-first calls, and `.render()`.
export const nestedArrays = () => Button([[Slot({ key: "a", color: "red" }), Slot({ key: "b", color: "red" })], Slot({ key: "c", color: "red" })], { css: { ...base } });
export const nestedChildrenFirst = () => Button([Span([Slot({ key: "icon", color: "red" })], { key: "label", css: { ...base } })], { css: { ...base } });
export const rendered = () => Button([Slot({ key: "icon", color: "red" })], { css: { ...base } }).render();
root.render(Button([Slot({ key: "icon", color: "red" })], { css: { ...base } }));
// Left as written: a child whose own style is read at run time; a call given
// two leading object literals, which could be either order; spread arguments;
// a lowercase callee's arguments.
export const childStyleDynamic = () => Button([Slot({ key: "icon", color: fx() })], { css: { ...base } });
export const childCssSpread = () => Button([Slot({ key: "icon", css: { ...base } })], { css: { ...base } });
export const twoObjects = () => Card({ padding: 1 }, { css: { ...base } });
export const spreadChildren = () => Button(...[Slot({ key: "icon", color: "red" })], { css: { ...base } });
export const spreadProps = () => Button([Slot({ key: "icon", color: "red" })], ...rest);
export const lowercase = () => wrap([Slot({ key: "icon", color: "red" })], { css: { ...base } });
