import { __meoFactoryCall } from "@meonode/ui/factory-call";
// A module that imports @meonode/ui only for types: its calls are joined all the
// same, through @meonode/ui/factory-call, which imports nothing.
import type { NodeElement } from "@meonode/ui";
import { type Theme } from "@meonode/ui";
import { Box, Row } from "meo-canvas";
import { Card } from "./nodes";
const __meoSite0 = {
    at: 0,
    r: 1
};
const __meoSite1 = {
    at: 0,
    r: 1
};
export const scene = Row({
    padding: 8,
    children: [
        __meoFactoryCall(Box, __meoSite0, {
            width: 10
        })
    ]
});
export const card = (theme: Theme): NodeElement =>Card({
        padding: 1,
        theme
    });
export const plain = ()=>__meoFactoryCall(Card, __meoSite1, {
        padding: 1
    });
