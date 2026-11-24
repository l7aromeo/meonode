import { registerStaticCss as __meoCss } from "@meonode/ui";
import { createChildrenFirstNode, createNode } from "@meonode/ui";
__meoCss("52orh5gatjh89", [
    [
        "2lg72t9javh46",
        "flex-shrink:0;min-height:0;min-width:0;background:red;padding:8px;color:white;&:hover{color:blue;}"
    ],
    [
        "dpu8lf9irv74f",
        "flex-shrink:0;min-height:0;min-width:0;background:red;padding:4px;&:hover{color:green;background:var(--meonode-theme-surface--len, var(--meonode-theme-surface));}margin:1px;"
    ],
    [
        "0t3lvdqkt38fb",
        "flex-shrink:0;min-height:0;min-width:0;background:red;padding:4px;&:hover{color:blue;}"
    ],
    [
        "74sj838sigcrc",
        "flex-shrink:0;min-height:0;min-width:0;background:red;padding:4px;color:black;"
    ],
    [
        "d37n7j39d3cg6",
        "flex-shrink:0;min-height:0;min-width:0;width:var(--meonode-theme-layout-inspector--len, var(--meonode-theme-layout-inspector));padding:2px;"
    ],
    [
        "7k6jtd0ljnn25",
        "flex-shrink:0;min-height:0;min-width:0;color:red;"
    ],
    [
        "bu5mtlfpadotf",
        "flex-shrink:0;min-height:0;min-width:0;color:red;font-size:12px;"
    ],
    [
        "80oi3m12rglit",
        "flex-shrink:0;min-height:0;min-width:0;margin:0 0 8px;font-weight:600;"
    ],
    [
        "2mqacvfk8fi0e",
        "flex-shrink:0;min-height:0;min-width:0;padding:1px;"
    ],
    [
        "48h6agq20c4i3",
        "flex-shrink:0;min-height:0;min-width:0;padding:1px;color:red;"
    ],
    [
        "5ucec2292abm5",
        "flex-shrink:0;min-height:0;min-width:0;padding:1px;color:blue;"
    ]
]);
// Flat and css defaults, merged with the call's flat and css.
const Card = createNode("div", {
    background: "red",
    padding: 4,
    css: {
        "&:hover": {
            color: "blue"
        }
    }
});
Card({
    __meo$: 2,
    __meo$n: "2lg72t9javh46",
    __meo$r: 1,
    __meo$i: "{k10:backgrounds3:redk7:paddingn4;k3:css{k7:&:hover{k5:colors4:blue}}}",
    __meo$k: "moxbekquzfumy",
    children: "Hi"
});
Card({
    __meo$: 2,
    __meo$n: "dpu8lf9irv74f",
    __meo$r: 1,
    __meo$i: "{k10:backgrounds3:redk7:paddingn4;k3:css{k7:&:hover{k5:colors4:blue}}}",
    __meo$k: "m1blw2f0sswbyi"
});
Card({
    __meo$: 2,
    __meo$n: "0t3lvdqkt38fb",
    __meo$r: 1,
    __meo$i: "{k10:backgrounds3:redk7:paddingn4;k3:css{k7:&:hover{k5:colors4:blue}}}",
    __meo$k: "m3qqp6yztmciwm",
    children: "no own styles"
});
Card({
    __meo$: 2,
    __meo$n: "74sj838sigcrc",
    __meo$r: 1,
    __meo$i: "{k10:backgrounds3:redk7:paddingn4;k3:css{k7:&:hover{k5:colors4:blue}}}",
    __meo$k: "m1u9oirw59sd7j"
});
// DOM defaults join the call's DOM props, in the merged order.
const Pane = createNode("aside", {
    "data-pane": true,
    "aria-label": "Details",
    width: "theme.layout.inspector",
    tabIndex: -1
});
Pane({
    __meo$: 2,
    __meo$n: "d37n7j39d3cg6",
    __meo$r: 1,
    __meo$i: "{k9:data-panetk10:aria-labels7:Detailsk5:widths22:theme.layout.inspectork8:tabIndexn-1;}",
    __meo$d: {
        "data-pane": true,
        "aria-label": "Facts",
        tabIndex: -1,
        id: "facts"
    },
    __meo$k: "m2ntt9acx1o2eb"
});
// className is replaced by the call's.
const Labelled = createNode("span", {
    className: "base",
    color: "red"
});
Labelled({
    __meo$: 2,
    __meo$n: "7k6jtd0ljnn25",
    __meo$r: 1,
    __meo$i: "{k9:classNames4:basek5:colors3:red}",
    __meo$d: {
        className: "own"
    },
    __meo$k: "m32e8b1o5kj7j0"
});
Labelled({
    __meo$: 2,
    __meo$n: "bu5mtlfpadotf",
    __meo$r: 1,
    __meo$i: "{k9:classNames4:basek5:colors3:red}",
    __meo$d: {
        className: "base"
    },
    __meo$k: "m19tkt3k5svyl2"
});
// Children-first: the call's children win, the defaults' never survive.
const Title = createChildrenFirstNode("h2", {
    children: "default",
    margin: 0,
    fontWeight: 600
});
Title("Heading", {
    __meo$: 2,
    __meo$n: "80oi3m12rglit",
    __meo$r: 1,
    __meo$i: "{k8:childrens7:defaultk6:marginn0;k10:fontWeightn600;}",
    __meo$k: "m1k2wq35hc4alm"
});
// No initial props: a host factory.
const Box = createNode("div");
Box({
    __meo$: 2,
    __meo$n: "2mqacvfk8fi0e",
    __meo$r: 1,
    __meo$k: "m1bnpdhs6jk4p8"
});
// Composition the runtime does not merge: left to it.
Card({
    __meo$: 2,
    __meo$k: "mffe426htp7t9",
    css: "color: red;"
});
// Not literal defaults, a styles key, a blocking prop: left to the runtime.
const Dynamic = createNode("div", {
    padding: size
});
Dynamic({
    __meo$: 2,
    __meo$c: {
        color: "red"
    },
    __meo$k: "m1690r6oomabwc"
});
const Reserved = createNode("div", {
    css: {
        color: "red",
        styles: {
            margin: 1
        }
    }
});
Reserved({
    __meo$: 2,
    __meo$c: {
        padding: 1
    },
    __meo$k: "m13k1xurod1u95"
});
const Themed = createNode("div", {
    theme: {
        mode: "dark"
    },
    padding: 1
});
Themed({
    __meo$: 2,
    __meo$c: {
        color: "red"
    },
    __meo$k: "m2g7js1ws4t3dk"
});
// A component target is not a host.
const Wrapped = createNode(Component, {
    padding: 1
});
Wrapped({
    __meo$: 2,
    __meo$c: {
        color: "red"
    },
    __meo$k: "m33la2lbruilg"
});
// A component selector in the defaults' css is not a map the runtime merges.
const Selected = createNode("div", {
    css: {
        __emotion_styles: "x",
        color: "red"
    }
});
Selected({
    __meo$: 2,
    __meo$c: {
        padding: 1
    },
    __meo$k: "m2zuzhgr46e0z7"
});
// A token in a DOM default is written as a call's own DOM token is.
const Tipped = createNode("div", {
    title: "theme.primary",
    padding: 1
});
Tipped({
    __meo$: 2,
    __meo$n: "48h6agq20c4i3",
    __meo$r: 1,
    __meo$i: "{k5:titles13:theme.primaryk7:paddingn1;}",
    __meo$d: {
        title: "var(--meonode-theme-primary)"
    },
    __meo$k: "m2qxiql19bvovm"
});
Tipped({
    __meo$: 2,
    __meo$n: "5ucec2292abm5",
    __meo$r: 1,
    __meo$i: "{k5:titles13:theme.primaryk7:paddingn1;}",
    __meo$d: {
        title: "var(--meonode-theme-primary)"
    },
    __meo$k: "m1c2does85hyr6"
});
// Defaults holding the compiler's own marker keys, an integer-like key, or a number
// with no exact text: left to the runtime.
const Marked = createNode("div", {
    __meo$: 2,
    padding: 1
});
Marked({
    __meo$: 2,
    __meo$c: {
        color: "red"
    },
    __meo$k: "m1atrevz1vlnmt"
});
const Indexed = createNode("div", {
    0: "x",
    padding: 1
});
Indexed({
    __meo$: 2,
    __meo$c: {
        color: "red"
    },
    __meo$k: "m3vnbwbvp7bw49"
});
const Huge = createNode("div", {
    opacity: 1e999,
    padding: 1
});
Huge({
    __meo$: 2,
    __meo$c: {
        color: "red"
    },
    __meo$k: "m33285otkk0ygt"
});
const NestedIndex = createNode("div", {
    css: {
        "1": {
            color: "red"
        }
    },
    padding: 1
});
const StringIndex = createNode("div", {
    "2": "two",
    padding: 1
});
StringIndex({
    __meo$: 2,
    __meo$c: {
        color: "blue"
    },
    __meo$k: "mtox7eer507dw"
});
NestedIndex({
    __meo$: 2,
    __meo$c: {
        color: "blue"
    },
    __meo$k: "majjxsoptn66s"
});
const HugeAttr = createNode("div", {
    "data-n": 1e999,
    padding: 1
});
HugeAttr({
    __meo$: 2,
    __meo$c: {
        color: "red"
    },
    __meo$k: "m2xqjgjcg68uz0"
});
