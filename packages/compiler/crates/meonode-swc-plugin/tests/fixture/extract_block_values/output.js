import { registerStaticCss as __meoCss } from "@meonode/ui";
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
export const a = (p)=>Div({
        __meo$: 2,
        __meo$c: {
            padding: 4
        },
        __meo$k: "m2kraevimxjcwi",
        __meo$dyn: [
            "css"
        ],
        css: {
            "&:hover": {
                color: `${p.color}`
            }
        }
    });
export const b = (p)=>Div({
        __meo$: 2,
        __meo$n: p.on ? "25gvbuz2cy217" : "3pghyoa9mq71n",
        __meo$k: "m551qrbsxphac"
    });
export const c = (p)=>Div({
        __meo$: 2,
        __meo$c: {
            padding: 4
        },
        __meo$k: "mg5cg4o92knmw",
        __meo$dyn: [
            "css"
        ],
        css: {
            ".dark &": {
                color: p.on ? "blue" : "green",
                marginTop: p.n * 2
            }
        }
    });
export const d = (p)=>Div({
        __meo$: 2,
        __meo$n: p.on ? "01hnvshbfsnd0" : "0mdwjznn1arn1",
        __meo$k: "m3qpmewokk8af4"
    });
export const e = (p)=>Div({
        __meo$: 2,
        __meo$c: {
            padding: 4
        },
        __meo$k: "mj8u9cn0rz09m",
        __meo$dyn: [
            "css"
        ],
        css: {
            "& > p": {
                color: `${p.color}`
            }
        }
    });
export const f = (p)=>Div({
        __meo$: 2,
        __meo$c: {
            padding: 4
        },
        __meo$k: "mwz1myiz8a77o",
        __meo$dyn: [
            "css"
        ],
        css: {
            "&:hover": {
                userSelect: `${p.color}`
            }
        }
    });
export const g = (p)=>Div({
        __meo$: 2,
        __meo$c: {
            padding: 4
        },
        __meo$k: "m1arxmwskexw4t",
        __meo$dyn: [
            "css"
        ],
        css: {
            "&:where(.x)": {
                color: `${p.color}`
            },
            "&::before": {
                content: `"${p.color}"`
            }
        }
    });
