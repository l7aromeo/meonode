import { createElement } from "react";
import { Div, Node, Row, Span, ThemeProvider } from "@meonode/ui";
import { Card } from "./card";
// Hosts, literals and branches over them take no slot; a component, an
// unknown value or a branch that may hold one takes one before it.
Div({
    padding: 4,
    children: [
        Div({ color: "red" }),
        Node(Card, {}),
        "text",
        on && Node(Card, {}),
        on ? Span("a") : null,
        on ? Node(Card, {}) : Div(),
        fallback || Div(),
        Div() || fallback,
        value ?? null,
        items,
        [Div(), Node(Card, {}), [label]],
        ThemeProvider({ children: Div() }),
        ...rest,
        Node(Card, {}),
    ],
});
// A single child, or a children-first call's first argument, is the empty path:
// a slot before the value as a whole.
Span(label, { padding: 4 });
Div({ children: Node(Card, {}) });
// Literals and host-only built elements take none.
Div({ children: "text" });
Div({ children: createElement("p", null, "hi") });
Div({ children: <p>hi <b>there</b></p> });
// A built element holding anything else is opaque to the walk.
Div({ children: createElement("p", null, Node(Card, {})) });
Div({ children: <p>{label}</p> });
Div({ children: <Card /> });
Div({ children: createElement(Card, null, "hi") });
// A generated list is one position; its items take the runtime's keyed-item rule.
Div({ children: rows.map((row) => Div({ key: row })) });
// A layout factory is a host.
Row({ children: [Node(Card, {})] });
// A component target would receive changed children: no marker.
Node(Card, { children: [Node(Card, {})] });
