import { registerStaticCss as __meoCss } from "@meonode/ui";
import { Div } from "@meonode/ui";
__meoCss("1gdiwztqpuzck", [
    [
        1,
        "mn-39fkc5xihpf2k",
        ".mn-39fkc5xihpf2k:hover:focus{color:red;}"
    ],
    [
        1,
        "mn-2mizy8lxu9kn1",
        ".mn-2mizy8lxu9kn1:hover{color:blue;}"
    ],
    [
        0,
        "mn-0e47bwo0vm4o6",
        ".mn-0e47bwo0vm4o6{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;}"
    ],
    [
        0,
        "mn-35l163g1tjy26",
        ".mn-35l163g1tjy26{min-height:0;}"
    ],
    [
        0,
        "mn-0zzfi4vug0nqv",
        ".mn-0zzfi4vug0nqv{min-width:0;}"
    ],
    [
        1,
        "mn-31m795q72to1h",
        ".mn-31m795q72to1h:hover{color:red;}"
    ],
    [
        2,
        "mn-3h6mmeriptjkq",
        "@media (min-width: 1px){.mn-3h6mmeriptjkq:hover{color:blue;}}"
    ],
    [
        1,
        "mn-28xx3twlv8fcu",
        ".mn-28xx3twlv8fcu:where(.x){color:red;}"
    ],
    [
        2,
        "mn-0gl2n5oev16co",
        "@media (min-width: 1px){.mn-0gl2n5oev16co{color:blue;}}"
    ],
    [
        1,
        "mn-0dpuyqwu6mmx7",
        ".mn-0dpuyqwu6mmx7:hover{margin:1px;}"
    ],
    [
        2,
        "mn-1lpy3jyozj1pb",
        "@media (min-width: 1px){.mn-1lpy3jyozj1pb:hover{margin-top:2px;}}"
    ],
    [
        1,
        "mn-16c0x2kh9q1pt",
        ".mn-16c0x2kh9q1pt::part(label){color:red;}"
    ],
    [
        2,
        "mn-2gyoatrfq0gmy",
        "@media (min-width: 1px){.mn-2gyoatrfq0gmy::part(label){color:blue;}}"
    ]
]);
// Different specificities: either order is kept.
Div({
    __meo$: 2,
    __meo$s: "mn-39fkc5xihpf2k mn-2mizy8lxu9kn1 mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "m1c1hekb1u9nuz"
});
// Equal specificity, source order already the buckets' (pseudo, then at-rule).
Div({
    __meo$: 2,
    __meo$s: "mn-31m795q72to1h mn-3h6mmeriptjkq mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "ml2y2yonl5w2t"
});
// The same pair in the opposite order: runtime.
Div({
    __meo$: 2,
    __meo$k: "m1d6y4r1bb2cc9",
    __meo$dyn: [
        "css"
    ],
    css: {
        "@media (min-width: 1px)": {
            "&:hover": {
                color: "blue"
            }
        },
        "&:hover": {
            color: "red"
        }
    }
});
// Equal specificity in one bucket: runtime.
Div({
    __meo$: 2,
    __meo$k: "m3satbuy1yo21n",
    __meo$dyn: [
        "css"
    ],
    css: {
        "&:hover": {
            color: "red"
        },
        "&:focus": {
            color: "blue"
        }
    }
});
Div({
    __meo$: 2,
    __meo$k: "m355xqjhgjze1q",
    __meo$dyn: [
        "css"
    ],
    css: {
        "@media (min-width: 1px)": {
            color: "red"
        },
        "@supports (display: grid)": {
            color: "blue"
        }
    }
});
// `:where()` adds nothing, as an at-rule's own declarations: in bucket order.
Div({
    __meo$: 2,
    __meo$s: "mn-28xx3twlv8fcu mn-0gl2n5oev16co mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "mras5h186j0zl"
});
Div({
    __meo$: 2,
    __meo$k: "m24a69pcfjl3ed",
    __meo$dyn: [
        "css"
    ],
    css: {
        "@media (min-width: 1px)": {
            color: "blue"
        },
        "&:where(.x)": {
            color: "red"
        }
    }
});
// An object's own declarations come before its nested rules, wherever written.
Div({
    __meo$: 2,
    __meo$s: "mn-3h6mmeriptjkq mn-31m795q72to1h mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "m2n6k4hw3j71o9"
});
// Overlapping properties, not only the same one.
Div({
    __meo$: 2,
    __meo$s: "mn-0dpuyqwu6mmx7 mn-1lpy3jyozj1pb mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "mkvcjqspk3n3y"
});
Div({
    __meo$: 2,
    __meo$k: "m2mkl0y4m7rei6",
    __meo$dyn: [
        "css"
    ],
    css: {
        "@media (min-width: 1px)": {
            "&:hover": {
                marginTop: 2
            }
        },
        "&:hover": {
            margin: 1
        }
    }
});
// A specificity it cannot tell counts as equal.
Div({
    __meo$: 2,
    __meo$s: "mn-16c0x2kh9q1pt mn-2gyoatrfq0gmy mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "m3rio7dygera6g"
});
Div({
    __meo$: 2,
    __meo$k: "m23lb289vief9c",
    __meo$dyn: [
        "css"
    ],
    css: {
        "@media (min-width: 1px)": {
            "&::part(label)": {
                color: "blue"
            }
        },
        "&::part(label)": {
            color: "red"
        }
    }
});
