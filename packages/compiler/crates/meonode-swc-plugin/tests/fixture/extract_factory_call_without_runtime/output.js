import { __meoFactoryCall } from "@meonode/ui/factory-call";
// A module that imports @meonode/ui only for types: calls of local imports are
// joined (relative, absolute, `#` subpath and `~/` or `@/` alias), through
// @meonode/ui/factory-call, which imports nothing; calls of any other import
// stay as written, since this module's package may not resolve @meonode/ui.
import type { NodeElement } from "@meonode/ui";
import { type Theme } from "@meonode/ui";
import { Box, Row } from "meo-canvas";
import { Link } from "@src/components/Link";
import { Card } from "./nodes";
import { Abs } from "/abs/nodes";
import { Panel } from "#nodes";
import { Sheet } from "~/nodes";
import { Pane } from "@/nodes";
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
export const scene = ()=>Row({
        padding: 8,
        children: [
            Box({
                width: 10
            }),
            Link({
                padding: 1
            })
        ]
    });
export const card = (theme: Theme): NodeElement =>Card({
        padding: 1,
        theme
    });
export const local = ()=>[
        __meoFactoryCall(Card, __meoSite0, {
            padding: 1
        }),
        __meoFactoryCall(Abs, __meoSite1, {
            padding: 2
        }),
        __meoFactoryCall(Panel, __meoSite2, {
            padding: 3
        }),
        __meoFactoryCall(Sheet, __meoSite3, {
            padding: 4
        }),
        __meoFactoryCall(Pane, __meoSite4, {
            padding: 5
        })
    ];
