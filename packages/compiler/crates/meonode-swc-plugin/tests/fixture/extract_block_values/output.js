import { registerStaticCss as __meoCss, toCssValue as __meoVal } from "@meonode/ui";
import { Div } from "@meonode/ui";
__meoCss("28l09squp8c20", [
    [
        1,
        "mn-3ira0mmss1bvp",
        ".mn-3ira0mmss1bvp{padding:4px;}"
    ],
    [
        2,
        "mn-074wia9lvg4dp",
        ".mn-074wia9lvg4dp:hover{color:var(--mv-03t7wrtvlhhk2);}"
    ],
    [
        1,
        "mn-0e47bwo0vm4o6",
        ".mn-0e47bwo0vm4o6{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;}"
    ],
    [
        1,
        "mn-35l163g1tjy26",
        ".mn-35l163g1tjy26{min-height:0;}"
    ],
    [
        1,
        "mn-0zzfi4vug0nqv",
        ".mn-0zzfi4vug0nqv{min-width:0;}"
    ],
    [
        3,
        "mn-346lvqakg7v1r",
        "@media (min-width: 1px){.mn-346lvqakg7v1r{margin-top:4px;}}"
    ],
    [
        3,
        "mn-2d3o7ykfy08c0",
        "@media (min-width: 1px){.mn-2d3o7ykfy08c0{margin-top:8px;}}"
    ],
    [
        4,
        "mn-28cdf7wlt00zf",
        ".dark .mn-28cdf7wlt00zf{color:var(--mv-11g26mtrq1isx);margin-top:var(--mv-1nntwy82i5oxn);}"
    ],
    [
        2,
        "mn-2mizy8lxu9kn1",
        ".mn-2mizy8lxu9kn1:hover{color:blue;}"
    ],
    [
        2,
        "mn-1cvz7hdxzoxe6",
        ".mn-1cvz7hdxzoxe6:where(.x){color:var(--mv-2kwyknkxkpijf);}"
    ],
    [
        2,
        "mn-0dfuqjssgwelx",
        ".mn-0dfuqjssgwelx::before{content:var(--mv-10pd7vild7rkk);}"
    ]
]);
export const a = (p)=>Div({
        __meo$: 2,
        __meo$s: "mn-3ira0mmss1bvp mn-074wia9lvg4dp mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
        __meo$v: {
            "--mv-03t7wrtvlhhk2": __meoVal("color", `${p.color}`)
        },
        __meo$k: "m2kraevimxjcwi"
    });
export const b = (p)=>Div({
        __meo$: 2,
        __meo$s: "mn-3ira0mmss1bvp mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv" + (p.on ? " mn-346lvqakg7v1r" : " mn-2d3o7ykfy08c0"),
        __meo$k: "m551qrbsxphac"
    });
export const c = (p)=>Div({
        __meo$: 2,
        __meo$s: "mn-3ira0mmss1bvp mn-28cdf7wlt00zf mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
        __meo$v: {
            "--mv-11g26mtrq1isx": __meoVal("color", p.on ? "blue" : "green"),
            "--mv-1nntwy82i5oxn": __meoVal("marginTop", p.n * 2)
        },
        __meo$k: "mg5cg4o92knmw"
    });
export const d = (p)=>Div({
        __meo$: 2,
        __meo$s: "mn-3ira0mmss1bvp mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv" + (p.on ? " mn-2mizy8lxu9kn1" : ""),
        __meo$k: "m3qpmewokk8af4"
    });
export const e = (p)=>Div({
        __meo$: 2,
        __meo$s: "mn-3ira0mmss1bvp",
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
        __meo$s: "mn-3ira0mmss1bvp",
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
        __meo$s: "mn-3ira0mmss1bvp mn-1cvz7hdxzoxe6 mn-0dfuqjssgwelx mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
        __meo$v: {
            "--mv-2kwyknkxkpijf": __meoVal("color", `${p.color}`),
            "--mv-10pd7vild7rkk": __meoVal("content", `"${p.color}"`)
        },
        __meo$k: "m1arxmwskexw4t"
    });
