("use client");
// A parenthesized string is an expression, not a directive: the added import goes first.
import { Div } from "@meonode/ui";
export const Panel = () => Div({ padding: 8, children: "x" }).render();
