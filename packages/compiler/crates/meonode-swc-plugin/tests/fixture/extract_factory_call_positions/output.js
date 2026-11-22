import { __meoFactoryCall } from "@meonode/ui/factory-call";
import { Div } from "@meonode/ui";
import { Card, Title } from "./nodes";
import { Inter } from "next/font/google";
const __meoSite0 = {
    at: 0,
    r: 1
};
const __meoSite1 = {
    at: 0,
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
    at: 0,
    r: 1
};
const __meoSite6 = {
    at: 0,
    r: 1
};
const __meoSite7 = {
    at: 0,
    r: 1
};
const __meoSite8 = {
    at: 0,
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
    at: 0
};
const __meoSite12 = {
    at: 1,
    r: 1
};
const __meoSite13 = {
    at: 0,
    r: 1
};
const __meoSite14 = {
    at: 0,
    r: 1
};
// Joined: calls in node position. A return, an arrow's body, parenthesized.
function A() {
    return __meoFactoryCall(Card, __meoSite0, {
        padding: 1
    });
}
const B = ()=>__meoFactoryCall(Card, __meoSite1, {
        padding: 2
    });
const C = ()=>__meoFactoryCall(Card, __meoSite2, {
        padding: 3
    });
// A `children` value, through arrays, conditionals and logical operators.
const tree = Div({
    __meo$: 2,
    __meo$k: "m3upv5ybotybf5",
    __meo$list: 1,
    children: __meoFactoryCall(Card, __meoSite3, {
        padding: 4
    })
});
const D = (on)=>Div({
        __meo$: 2,
        __meo$k: "m1txc8r9bltlwm",
        children: [
            on ? __meoFactoryCall(Card, __meoSite4, {
                padding: 5
            }) : __meoFactoryCall(Card, __meoSite5, {
                padding: 6
            }),
            on && __meoFactoryCall(Card, __meoSite6, {
                padding: 7
            }),
            __meoFactoryCall(Card, __meoSite7, {
                padding: 8
            }) || __meoFactoryCall(Card, __meoSite8, {
                padding: 9
            }),
            __meoFactoryCall(Card, __meoSite9, {
                padding: 10
            }) ?? __meoFactoryCall(Card, __meoSite10, {
                padding: 11
            })
        ]
    });
// A children-first call's children.
const E = ()=>__meoFactoryCall(Title, __meoSite12, __meoFactoryCall(Card, __meoSite11, {
        padding: 12
    }), {
        margin: 0
    });
// What `.render()` is called on, and what it is given.
function F() {
    const node = __meoFactoryCall(Card, __meoSite13, {
        padding: 13
    }).render();
    return node;
}
root.render(__meoFactoryCall(Card, __meoSite14, {
    padding: 14
}));
// Left as written: calls that are not nodes where they stand. A module-scope
// constant (a font loader, a hoisted node), a local constant, an argument of
// another call (a method other than `.render()` too), a lowercase callee's
// first argument, and the left of `&&`.
const font = Inter({
    subsets: [
        "latin"
    ],
    display: "swap"
});
const footer = Card({
    padding: 15
});
function G() {
    const header = Card({
        padding: 16
    });
    return Div({
        __meo$: 2,
        __meo$k: "m2290ut8c9y62",
        __meo$list: 1,
        children: header
    });
}
log(Card({
    padding: 17
}));
items.push(Card({
    padding: 20
}));
const H = ()=>wrap(Card({
        padding: 18
    }), {
        margin: 0
    });
const I = (on)=>Div({
        __meo$: 2,
        __meo$k: "m39ifrl62fgezo",
        __meo$list: 1,
        children: Card({
            padding: 19
        }) && on
    });
// A prop other than `children`.
const J = ()=>Div({
        __meo$: 2,
        __meo$d: {
            header: Card({
                padding: 21
            })
        },
        __meo$k: "m3qfyyrn75i9zr",
        __meo$dyn: [
            "header"
        ]
    });
