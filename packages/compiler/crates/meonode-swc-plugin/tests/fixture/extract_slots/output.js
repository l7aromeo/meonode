import { registerStaticCss as __meoCss } from "@meonode/ui";
import { createElement } from "react";
import { Div, Node, Row, Span, ThemeProvider } from "@meonode/ui";
import { Card } from "./card";
__meoCss("34xxgbvlj8w7h", [
    [
        "27fvjgatqmrja",
        "flex-shrink:0;min-height:0;min-width:0;color:red;"
    ],
    [
        "2scoofan7u119",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;"
    ],
    [
        "2clwfawpu9xmz",
        "flex-shrink:0;min-height:0;min-width:0;display:flex;flex-direction:row;"
    ]
]);
// Hosts, literals and branches over them take no slot; a component, an
// unknown value or a branch that may hold one takes one before it.
Div({
    __meo$: 2,
    __meo$n: "2scoofan7u119",
    __meo$k: "m13vuz97gkmrxv",
    __meo$list: 1,
    children: [
        Div({
            __meo$: 2,
            __meo$n: "27fvjgatqmrja",
            __meo$k: "m2gtfxc0hfwt7u"
        }),
        Node(Card, {
            __meo$: 2,
            __meo$k: "mb4n6rewrwl00"
        }),
        "text",
        on && Node(Card, {
            __meo$: 2,
            __meo$k: "m25acly1q35tce"
        }),
        on ? Span("a") : null,
        on ? Node(Card, {
            __meo$: 2,
            __meo$k: "mjgug7h9e9qtm"
        }) : Div(),
        fallback || Div(),
        Div() || fallback,
        value ?? null,
        items,
        [
            Div(),
            Node(Card, {
                __meo$: 2,
                __meo$k: "m36v4wx69c4npj"
            }),
            [
                label
            ]
        ],
        ThemeProvider({
            children: Div()
        }),
        ...rest,
        Node(Card, {
            __meo$: 2,
            __meo$k: "m3e4t0avtpzkfy"
        })
    ],
    __meo$p: [
        1,
        3,
        5,
        6,
        7,
        8,
        9,
        [
            10,
            1
        ],
        [
            10,
            2,
            0
        ],
        11
    ]
});
// A single child, or a children-first call's first argument, is position 0.
Span(label, {
    __meo$: 2,
    __meo$n: "2scoofan7u119",
    __meo$k: "m2dpilmtni7n8v",
    __meo$list: 1,
    __meo$p: [
        0
    ]
});
Div({
    __meo$: 2,
    __meo$k: "m6mel3iy10rg3",
    children: Node(Card, {
        __meo$: 2,
        __meo$k: "m48xlbigs95yv"
    }),
    __meo$p: [
        0
    ]
});
// Literals and host-only built elements take none.
Div({
    __meo$: 2,
    __meo$k: "m3lsq0wd5yq6ut",
    children: "text"
});
Div({
    __meo$: 2,
    __meo$k: "m1mvryawj6xmir",
    __meo$list: 1,
    children: createElement("p", null, "hi")
});
Div({
    __meo$: 2,
    __meo$k: "m2p1yowjta7jg",
    __meo$list: 1,
    children: <p>hi <b>there</b></p>
});
// A built element holding anything else is opaque to the walk.
Div({
    __meo$: 2,
    __meo$k: "m11xo2945ba9qt",
    __meo$list: 1,
    children: createElement("p", null, Node(Card, {
        __meo$: 2,
        __meo$k: "ml30r7pfd2wl6"
    })),
    __meo$p: [
        0
    ]
});
Div({
    __meo$: 2,
    __meo$k: "m155pa6waqlncd",
    __meo$list: 1,
    children: <p>{label}</p>,
    __meo$p: [
        0
    ]
});
Div({
    __meo$: 2,
    __meo$k: "m21psw38xk9a2g",
    __meo$list: 1,
    children: <Card/>,
    __meo$p: [
        0
    ]
});
Div({
    __meo$: 2,
    __meo$k: "m3omhg5j103rpo",
    __meo$list: 1,
    children: createElement(Card, null, "hi"),
    __meo$p: [
        0
    ]
});
// A generated list is one position; its items take the runtime's keyed-item rule.
Div({
    __meo$: 2,
    __meo$k: "m3jrkqghavha82",
    __meo$list: 1,
    children: rows.map((row)=>Div({
            __meo$: 2,
            __meo$k: "mex0wt7r5g9lp",
            key: row
        })),
    __meo$p: [
        0
    ]
});
// A layout factory is a host.
Row({
    __meo$: 2,
    __meo$n: "2clwfawpu9xmz",
    __meo$i: "display:flex;flexDirection:row;",
    __meo$k: "m2e8ao907553ch",
    children: [
        Node(Card, {
            __meo$: 2,
            __meo$k: "m2i7ymtf4rgzcz"
        })
    ],
    __meo$p: [
        0
    ]
});
// A component target would receive changed children: no marker.
Node(Card, {
    __meo$: 2,
    __meo$k: "m19fo8v9bax1u3",
    children: [
        Node(Card, {
            __meo$: 2,
            __meo$k: "mis4jxcw2sbnt"
        })
    ]
});
