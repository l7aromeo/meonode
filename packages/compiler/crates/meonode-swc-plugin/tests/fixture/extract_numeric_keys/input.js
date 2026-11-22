// Numeric keys in props, and in other objects of the module: compiled without
// a panic. The calls that hold them stay on the runtime path.
import { Div, createNode } from "@meonode/ui";
import { Card } from "./nodes";
import { createElement } from "react";
export const X = createNode("div", { padding: 1 });
export const table = { 0: "zero", 1n: "one" };
export const a = () => Div({ 2: "y", color: "red" });
export const b = () => X({ 1: "x", color: "red" });
export const c = () => Card({ 1: "x", padding: 1 });
export const d = () => Div({ children: Card({ 3: "z" }) });
export const e = () => Div({ children: [createElement("div", { 4: "w" }), Div({ 5: "v" })] });
export const Y = createNode("div", { 6: "u", padding: 1 });
export const f = () => Y({ color: "red" });
export const g = () => Div({ css: { 7: { color: "red" } }, padding: 1 });
export const h = () => X({ css: { 8: "t" }, color: "blue" });
export const i = () => Div({ 0x10: "hex", 1e3: "exp", color: "red" });
