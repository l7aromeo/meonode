import { __meoFactoryCall } from "@meonode/ui";
// A module importing @meonode/ui at run time, then for types only: its calls
// are joined.
import { Div } from "@meonode/ui";
import { type NodeElement } from "@meonode/ui";
import { Card } from "./nodes";
const __meoSite0 = {
    at: 0,
    r: 1
};
export const card = (): NodeElement =>Div({
        __meo$: 2,
        __meo$k: "m2xddv9ugiyg5q",
        __meo$list: 1,
        children: __meoFactoryCall(Card, __meoSite0, {
            padding: 1
        })
    });
