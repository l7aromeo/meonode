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
    __meo$r: 1,
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
    ]
});
// A single child, or a children-first call's first argument, is the empty path:
// a slot before the value as a whole.
Span(label, {
    __meo$: 2,
    __meo$n: "2scoofan7u119",
    __meo$r: 1,
    __meo$k: "m1i9vrn1065hf3",
    __meo$list: 1
});
Div({
    __meo$: 2,
    __meo$k: "m1ifog2zmu0dwt",
    children: Node(Card, {
        __meo$: 2,
        __meo$k: "mwcsm5o7iasam"
    })
});
// Literals and host-only built elements take none.
Div({
    __meo$: 2,
    __meo$k: "m2bmet5ummxrko",
    children: "text"
});
Div({
    __meo$: 2,
    __meo$k: "m1wgtiwyp1p1zn",
    __meo$list: 1,
    children: createElement("p", null, "hi")
});
Div({
    __meo$: 2,
    __meo$k: "m3snerkol2x14l",
    __meo$list: 1,
    children: <p>hi <b>there</b></p>
});
// A built element holding anything else is opaque to the walk.
Div({
    __meo$: 2,
    __meo$k: "m1o54uc85xsct6",
    __meo$list: 1,
    children: createElement("p", null, Node(Card, {
        __meo$: 2,
        __meo$k: "muedzbaryv473"
    }))
});
Div({
    __meo$: 2,
    __meo$k: "m18yz8rg1hah65",
    __meo$list: 1,
    children: <p>{label}</p>
});
Div({
    __meo$: 2,
    __meo$k: "m78lugxl44m2c",
    __meo$list: 1,
    children: <Card/>
});
Div({
    __meo$: 2,
    __meo$k: "m1g0xdn8y1dg8n",
    __meo$list: 1,
    children: createElement(Card, null, "hi")
});
// A generated list is one position; its items take the runtime's keyed-item rule.
Div({
    __meo$: 2,
    __meo$k: "m32vg7ym5orjpp",
    __meo$list: 1,
    children: rows.map((row)=>Div({
            __meo$: 2,
            __meo$k: "minmk0uel7sc1",
            key: row
        }))
});
// A layout factory is a host.
Row({
    __meo$: 2,
    __meo$n: "2clwfawpu9xmz",
    __meo$r: 1,
    __meo$i: "display:flex;flexDirection:row;",
    __meo$k: "m14wsbo5ei4ta0",
    children: [
        Node(Card, {
            __meo$: 2,
            __meo$k: "m1at7spirp09eg"
        })
    ]
});
// A component target would receive changed children: no marker.
Node(Card, {
    __meo$: 2,
    __meo$k: "m295xw2r2s5o3a",
    children: [
        Node(Card, {
            __meo$: 2,
            __meo$k: "m19xg9mqey2jgc"
        })
    ]
});
// A spread's own index is marked when its first item may need a slot; nothing
// inside or after it is.
Div({
    __meo$: 2,
    __meo$k: "mh5xoo56go89o",
    __meo$list: 1,
    children: [
        Node(Card, {
            __meo$: 2,
            __meo$k: "m2dqpor1ktgacy"
        }),
        ...on ? [
            Node(Card, {
                __meo$: 2,
                __meo$k: "m2jj5ylqhh2gxl"
            })
        ] : [],
        Node(Card, {
            __meo$: 2,
            __meo$k: "m2w8tuulnfaw2m"
        })
    ]
});
Div({
    __meo$: 2,
    __meo$k: "m3b7i45jow1eiv",
    __meo$list: 1,
    children: [
        label,
        ...rows.map((row)=>Node(Card, {
                __meo$: 2,
                __meo$k: "m1vackx4dl57is",
                key: row
            })),
        label
    ]
});
Div({
    __meo$: 2,
    __meo$k: "mbuk1ul63laxe",
    __meo$list: 1,
    children: [
        label,
        ...on ? [
            label
        ] : [
            Div()
        ],
        ...on ? [
            label
        ] : [],
        label
    ]
});
// A spread whose branches are empty or start with a walked child needs none.
Div({
    __meo$: 2,
    __meo$k: "mth7n7tfxd1ny",
    __meo$list: 1,
    children: [
        label,
        ...on ? [
            Div(),
            label
        ] : [],
        label
    ]
});
