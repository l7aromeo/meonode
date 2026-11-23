import { registerStaticCss as __meoCss, __meoFactoryCall } from "@meonode/ui";
import { Div, ThemeProvider } from "@meonode/ui";
import { Card, Title, Pane, Badge, Panel, helper, Icon } from "./nodes";
import Sheet from "./sheet";
import * as Nodes from "./all";
import { Button } from "@meonode/mui";
import { RichTreeView } from "@meonode/mui/x-tree-view";
import { StyleRegistry } from "@meonode/ui/nextjs-registry";
import { Inter } from "next/font/google";
import { Roboto } from "@next/font/google";
__meoCss("1cbfyawp0yl3b", [
    [
        "1aqk60jpzzigw",
        "flex-shrink:0;min-height:0;min-width:0;padding:1px;"
    ]
]);
const __meoSite0 = {
    at: 0,
    r: 1
};
const __meoSite1 = {
    at: 1,
    r: 1
};
const __meoSite2 = {
    at: 0,
    r: 1
};
const __meoSite3 = {
    at: 0,
    r: 1
};
const __meoSite4 = {
    at: 0,
    r: 1
};
const __meoSite5 = {
    at: 0
};
const __meoSite6 = {
    at: 0,
    r: 1
};
const __meoSite7 = {
    at: 0
};
const __meoSite8 = {
    at: 1,
    r: 1
};
const __meoSite9 = {
    at: 0,
    r: 1
};
const __meoSite10 = {
    at: 0,
    r: 1
};
const __meoSite11 = {
    at: 0,
    r: 1
};
const __meoSite12 = {
    at: 0,
    r: 1
};
// Props first, static style, as the first node of the walk: the site is a carrier.
export const r0 = ()=>__meoFactoryCall(Card, __meoSite0, {
        padding: 8,
        css: {
            "&:hover": {
                color: "red"
            }
        },
        onClick: handle,
        children: "x"
    });
// Children first, with props and deps.
export const r1 = ()=>__meoFactoryCall(Title, __meoSite1, "Heading", {
        margin: 0
    }, [
        dep
    ]);
// No arguments; only children; a default import; deps after props.
export const r2 = ()=>__meoFactoryCall(Pane, __meoSite2);
export const r3 = ()=>__meoFactoryCall(Sheet, __meoSite3, {
        children: body
    });
export const r4 = ()=>__meoFactoryCall(Card, __meoSite4, {
        color: "red"
    }, [
        dep
    ]);
// A call among another's children follows it: no mark of its own.
export const r5 = ()=>__meoFactoryCall(Card, __meoSite6, {
        padding: 1,
        children: [
            __meoFactoryCall(Badge, __meoSite5, {
                color: "red"
            })
        ]
    });
// A children-first call's children are its first argument; a memoized call is cut
// before, so the node under it is marked.
export const r6 = ()=>__meoFactoryCall(Title, __meoSite8, [
        __meoFactoryCall(Badge, __meoSite7, {
            color: "green"
        })
    ], {
        margin: 0
    });
export const r7 = ()=>__meoFactoryCall(Card, __meoSite10, {
        padding: 2,
        children: [
            __meoFactoryCall(Badge, __meoSite9, {
                color: "blue"
            }, [
                dep
            ])
        ]
    });
// Among a host's children, keyed and not: a slot before each, so each is marked.
export const r8 = ()=>Div({
        __meo$: 2,
        __meo$n: "1aqk60jpzzigw",
        __meo$r: 1,
        __meo$k: "m1hmhvh1rwzmqb",
        children: [
            __meoFactoryCall(Badge, __meoSite11, {
                key: "a",
                color: "blue"
            }),
            __meoFactoryCall(Badge, __meoSite12, {
                fontSize: 12
            })
        ]
    });
// Left as written: a style read at run time, a shorthand style prop, a spread
// argument or prop, two leading objects, a refused prop, a member call, a
// lowercase import, a component rendered as JSX, a @meonode/ui export, a local
// function, and a spread in css.
export const r9 = ()=>Card({
        padding: size
    });
export const r10 = ()=>Card({
        color
    });
export const r11 = ()=>Card(...args);
export const r12 = ()=>Card({
        padding: 1
    }, ...rest);
export const r13 = ()=>Card({
        ...rest,
        padding: 1
    });
export const r14 = ()=>Panel({
        a: 1
    }, {
        padding: 1
    });
export const r15 = ()=>Card({
        theme: dark,
        padding: 1
    });
export const r16 = ()=>Nodes.Card({
        padding: 1
    });
export const r17 = ()=>helper({
        padding: 1
    });
const view = <Icon size={2}/>;
export const r18 = ()=>Icon({
        padding: 1
    });
export const r19 = ()=>ThemeProvider({
        padding: 1
    });
const Local = (props)=>props;
export const r20 = ()=>Local({
        padding: 1
    });
export const r21 = ()=>Card({
        css: {
            ...base
        }
    });
// No @meonode package exports a createNode factory (@meonode/mui's come from
// createMuiNode): their calls are compiled as today, subpaths included.
export const r22 = ()=>Button({
        padding: 1
    });
export const r23 = ()=>RichTreeView({
        padding: 1
    });
export const r24 = ()=>StyleRegistry({
        children: body
    });
// Not in node position: font loaders' module-scope calls, which Next compiles
// only as written.
const inter = Inter({
    subsets: [
        "latin"
    ],
    display: "swap"
});
const roboto = Roboto({
    weight: "400"
});
