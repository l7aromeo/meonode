import { registerStaticCss as __meoCss, registerStaticTemplate as __meoTpl, toCssValue as __meoVal } from "@meonode/ui";
import { Div } from "@meonode/ui";
__meoCss("e2le9gi3cpv74", [
    [
        "e8518v0d9mm09",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;@media (min-width: 1px){margin-top:4px;}"
    ],
    [
        "2hiq5i8auk828",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;@media (min-width: 1px){margin-top:8px;}"
    ],
    [
        "8f3ja6css4gmb",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:hover{color:blue;}"
    ],
    [
        "3ahnrvmpadoc1",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:hover{}"
    ]
]);
__meoTpl("82b3o88s5go08", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:hover{color:",
    ";}"
]);
__meoTpl("7s5fpjoumcpqn", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;.dark &{color:blue;margin-top:",
    ";}"
]);
__meoTpl("40mi7ooofnjou", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;.dark &{color:green;margin-top:",
    ";}"
]);
__meoTpl("6jc22bencbgep", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;& > p{color:",
    ";}"
]);
__meoTpl("4nqairdac839m", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:hover{user-select:",
    ";}"
]);
__meoTpl("2a912hue1sn8g", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:where(.x){color:",
    ";}&::before{content:",
    ";}"
]);
export const a = (p)=>Div({
        __meo$: 2,
        __meo$t: [
            "82b3o88s5go08",
            __meoVal("color", `${p.color}`)
        ],
        __meo$r: 1,
        __meo$k: "m2kraevimxjcwi"
    });
export const b = (p)=>Div({
        __meo$: 2,
        __meo$n: p.on ? "e8518v0d9mm09" : "2hiq5i8auk828",
        __meo$r: 1,
        __meo$k: "m551qrbsxphac"
    });
export const c = (p)=>Div({
        __meo$: 2,
        __meo$t: p.on ? [
            "7s5fpjoumcpqn",
            __meoVal("marginTop", p.n * 2)
        ] : [
            "40mi7ooofnjou",
            __meoVal("marginTop", p.n * 2)
        ],
        __meo$r: 1,
        __meo$k: "mg5cg4o92knmw"
    });
export const d = (p)=>Div({
        __meo$: 2,
        __meo$n: p.on ? "8f3ja6css4gmb" : "3ahnrvmpadoc1",
        __meo$r: 1,
        __meo$k: "m3qpmewokk8af4"
    });
export const e = (p)=>Div({
        __meo$: 2,
        __meo$t: [
            "6jc22bencbgep",
            __meoVal("color", `${p.color}`)
        ],
        __meo$r: 1,
        __meo$k: "mj8u9cn0rz09m"
    });
export const f = (p)=>Div({
        __meo$: 2,
        __meo$t: [
            "4nqairdac839m",
            __meoVal("userSelect", `${p.color}`)
        ],
        __meo$r: 1,
        __meo$k: "mwz1myiz8a77o"
    });
export const g = (p)=>Div({
        __meo$: 2,
        __meo$t: [
            "2a912hue1sn8g",
            __meoVal("color", `${p.color}`),
            __meoVal("content", `"${p.color}"`)
        ],
        __meo$r: 1,
        __meo$k: "m1arxmwskexw4t"
    });
