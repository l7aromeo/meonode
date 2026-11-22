import { registerStaticCss as __meoCss, registerStaticTemplate as __meoTpl, toCssValue as __meoVal } from "@meonode/ui";
import { Div } from "@meonode/ui";
__meoCss("1bnpj3vr3agvh", [
    [
        "25gvbuz2cy217",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;@media (min-width: 1px){margin-top:4px;}"
    ],
    [
        "3pghyoa9mq71n",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;@media (min-width: 1px){margin-top:8px;}"
    ],
    [
        "01hnvshbfsnd0",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:hover{color:blue;}"
    ],
    [
        "0mdwjznn1arn1",
        "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:hover{}"
    ]
]);
__meoTpl("0j6fj2s0e4d43", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:hover{color:",
    ";}"
]);
__meoTpl("13rpbjvkualez", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;.dark &{color:blue;margin-top:",
    ";}"
]);
__meoTpl("2jnzf9llrxgdn", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;.dark &{color:green;margin-top:",
    ";}"
]);
__meoTpl("2djksr5tuztki", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;& > p{color:",
    ";}"
]);
__meoTpl("1l72c5arl6y9k", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:hover{user-select:",
    ";}"
]);
__meoTpl("1m1xyprrt17pw", [
    "flex-shrink:0;min-height:0;min-width:0;padding:4px;&:where(.x){color:",
    ";}&::before{content:",
    ";}"
]);
export const a = (p)=>Div({
        __meo$: 2,
        __meo$t: [
            "0j6fj2s0e4d43",
            __meoVal("color", `${p.color}`)
        ],
        __meo$r: 1,
        __meo$k: "m2kraevimxjcwi"
    });
export const b = (p)=>Div({
        __meo$: 2,
        __meo$n: p.on ? "25gvbuz2cy217" : "3pghyoa9mq71n",
        __meo$r: 1,
        __meo$k: "m551qrbsxphac"
    });
export const c = (p)=>Div({
        __meo$: 2,
        __meo$t: p.on ? [
            "13rpbjvkualez",
            __meoVal("marginTop", p.n * 2)
        ] : [
            "2jnzf9llrxgdn",
            __meoVal("marginTop", p.n * 2)
        ],
        __meo$r: 1,
        __meo$k: "mg5cg4o92knmw"
    });
export const d = (p)=>Div({
        __meo$: 2,
        __meo$n: p.on ? "01hnvshbfsnd0" : "0mdwjznn1arn1",
        __meo$r: 1,
        __meo$k: "m3qpmewokk8af4"
    });
export const e = (p)=>Div({
        __meo$: 2,
        __meo$t: [
            "2djksr5tuztki",
            __meoVal("color", `${p.color}`)
        ],
        __meo$r: 1,
        __meo$k: "mj8u9cn0rz09m"
    });
export const f = (p)=>Div({
        __meo$: 2,
        __meo$t: [
            "1l72c5arl6y9k",
            __meoVal("userSelect", `${p.color}`)
        ],
        __meo$r: 1,
        __meo$k: "mwz1myiz8a77o"
    });
export const g = (p)=>Div({
        __meo$: 2,
        __meo$t: [
            "1m1xyprrt17pw",
            __meoVal("color", `${p.color}`),
            __meoVal("content", `"${p.color}"`)
        ],
        __meo$r: 1,
        __meo$k: "m1arxmwskexw4t"
    });
