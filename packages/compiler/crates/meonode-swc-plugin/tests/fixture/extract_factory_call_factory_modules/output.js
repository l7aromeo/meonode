import { __meoFactoryCall } from "@meonode/ui";
// Calls of a factoryModules import, which the compiler marks as it marks a
// @meonode/ui call: joined at run time, they keep the marks it gives them with
// extraction off, so generated children stay a list.
import { Div } from "@meonode/ui";
import { Actions, Prose } from "./nodes";
import { Card } from "./cards";
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
export const a = (items)=>__meoFactoryCall(Actions, __meoSite0, {
        key: "actions",
        children: items.map((i)=>Div({
                __meo$: 2,
                __meo$k: "m25am6h9sd38ap",
                __meo$list: 1,
                key: i,
                children: i
            })),
        __meo$: 3,
        __meo$k: "m3h8wu24p96xwo",
        __meo$list: 1
    });
export const b = ()=>__meoFactoryCall(Prose, __meoSite1, {
        padding: 1,
        children: "text",
        __meo$: 3,
        __meo$k: "ms0727u81fb1i"
    });
// An import from another module is not one the compiler marks.
export const c = (items)=>__meoFactoryCall(Card, __meoSite2, {
        children: items.map((i)=>Div({
                __meo$: 2,
                __meo$k: "m379023j2my75i",
                __meo$list: 1,
                key: i,
                children: i
            }))
    });
// One the compiler can key but not partition (children read before an effectful
// prop, which partitioning would reorder): marked all the same.
export const d = (items)=>__meoFactoryCall(Actions, __meoSite3, {
        children: items,
        title: bump(),
        padding: 1,
        __meo$: 3,
        __meo$k: "m3ss5ko36nxaxx",
        __meo$list: 1
    });
