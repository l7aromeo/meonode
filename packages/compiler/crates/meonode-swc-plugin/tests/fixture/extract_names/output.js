import { registerStaticCss as __meoCss } from "@meonode/ui";
import { Div } from "@meonode/ui";
__meoCss("0zvg167fuwg0f", [
    [
        "0ac9pqh0scakj",
        "flex-shrink:0;min-height:0;min-width:0;padding:8px;&:hover{color:red;}"
    ],
    [
        "3k19afjaelh0g",
        "flex-shrink:0;min-height:0;min-width:0;& + &{margin-top:4px;}"
    ],
    [
        "1bgfj5v0mqjdh-card",
        "flex-shrink:0;min-height:0;min-width:0;label:card;color:red;"
    ],
    [
        "38a33pfafmky6",
        "flex-shrink:0;min-height:0;min-width:0;color:red;margin:1px;"
    ],
    [
        "040n3yerwdubz",
        "flex-shrink:0;min-height:0;min-width:0;color:blue;margin:2px;"
    ],
    [
        "2100qsnzg5svg",
        "flex-shrink:0;min-height:0;min-width:0;color:a;margin:1px;padding:1px;top:1px;left:1px;"
    ],
    [
        "39mf6eoswn4fw",
        "flex-shrink:0;min-height:0;min-width:0;color:b;margin:2px;padding:2px;top:2px;left:2px;"
    ]
]);
// A static node: one name, the runtime's own, for its whole style.
Div({
    __meo$: 2,
    __meo$n: "0ac9pqh0scakj",
    __meo$k: "m1zxf8g36rg3yy"
});
// The same style elsewhere shares the name and its registration.
Div({
    __meo$: 2,
    __meo$n: "0ac9pqh0scakj",
    __meo$k: "mmpiex4b85z20"
});
// Selectors naming the node twice match what Emotion's class matches.
Div({
    __meo$: 2,
    __meo$n: "3k19afjaelh0g",
    __meo$k: "m2sl0ljkxxg3n6"
});
// A label adds Emotion's suffix to the name.
Div({
    __meo$: 2,
    __meo$n: "1bgfj5v0mqjdh-card",
    __meo$k: "m2bioptii3kaqg"
});
// One name per SWITCH combination, chosen at the call site.
export const a = (p)=>Div({
        __meo$: 2,
        __meo$n: p.on ? "38a33pfafmky6" : "040n3yerwdubz",
        __meo$k: "m310hhvuka8gbv"
    });
// Past the cap of combinations, the node stays on the runtime path.
export const b = (p)=>Div({
        __meo$: 2,
        __meo$n: p.on ? "2100qsnzg5svg" : "39mf6eoswn4fw",
        __meo$k: "m11guxed1b4ksg"
    });
// A value only known at run time keeps the whole node on the runtime path.
export const c = (p)=>Div({
        __meo$: 2,
        __meo$c: {
            padding: 8,
            color: p.color
        },
        __meo$k: "m1e7femijxlbjh",
        __meo$dyn: [
            "color"
        ]
    });
