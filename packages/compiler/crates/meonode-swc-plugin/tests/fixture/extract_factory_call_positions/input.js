import { Div } from "@meonode/ui";
import { Card, Title } from "./nodes";
import { Inter } from "next/font/google";
// Joined: calls in node position. A return, an arrow's body, parenthesized.
function A() {
    return Card({ padding: 1 });
}
const B = () => Card({ padding: 2 });
const C = () => (Card({ padding: 3 }));
// A `children` value, through arrays, conditionals and logical operators.
const tree = Div({ children: Card({ padding: 4 }) });
const D = (on) => Div({ children: [on ? Card({ padding: 5 }) : Card({ padding: 6 }), on && Card({ padding: 7 }), Card({ padding: 8 }) || Card({ padding: 9 }), Card({ padding: 10 }) ?? Card({ padding: 11 })] });
// A children-first call's children.
const E = () => Title(Card({ padding: 12 }), { margin: 0 });
// What `.render()` is called on, and what it is given.
function F() {
    const node = Card({ padding: 13 }).render();
    return node;
}
root.render(Card({ padding: 14 }));
// Left as written: calls that are not nodes where they stand. A module-scope
// constant (a font loader, a hoisted node), a local constant, an argument of
// another call (a method other than `.render()` too), a lowercase callee's
// first argument, and the left of `&&`.
const font = Inter({ subsets: ["latin"], display: "swap" });
const footer = Card({ padding: 15 });
function G() {
    const header = Card({ padding: 16 });
    return Div({ children: header });
}
log(Card({ padding: 17 }));
items.push(Card({ padding: 20 }));
const H = () => wrap(Card({ padding: 18 }), { margin: 0 });
const I = (on) => Div({ children: Card({ padding: 19 }) && on });
// A prop other than `children`.
const J = () => Div({ header: Card({ padding: 21 }) });
