import { Div, Node } from "@meonode/ui";
import { Card } from "./card";
Node(Card, { padding: 8 });
Node("section", { padding: 8 });
Div({ ...rest, padding: 8 });
Div({ padding: 8, as: "a" });
Div({ padding: 8, css: someCss });
Div({ css: { label: "x", padding: 8 } });
