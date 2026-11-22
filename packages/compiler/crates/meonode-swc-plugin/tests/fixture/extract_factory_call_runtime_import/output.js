import { __meoFactoryCall } from "@meonode/ui/factory-call";
// A module importing @meonode/ui at run time, then for types only: it resolves
// the runtime, so a call of any import is joined, a path alias no rule knows
// (`@src/`) and a package included.
import { Div } from "@meonode/ui";
import { type NodeElement } from "@meonode/ui";
import { Link } from "@src/components/Link";
import Highlighter from "react-syntax-highlighter";
const __meoSite0 = {
    at: 0,
    r: 1
};
const __meoSite1 = {
    at: 0,
    r: 1
};
export const a = (): NodeElement =>Div({
        __meo$: 2,
        __meo$k: "m1ygkzf1cpzaj3",
        children: [
            __meoFactoryCall(Link, __meoSite0, {
                padding: 1
            }),
            __meoFactoryCall(Highlighter, __meoSite1, {
                margin: 0
            })
        ]
    });
