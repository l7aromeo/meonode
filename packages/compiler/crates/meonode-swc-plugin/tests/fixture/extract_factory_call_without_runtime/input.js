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
export const scene = () => Row({ padding: 8, children: [Box({ width: 10 }), Link({ padding: 1 })] });
export const card = (theme: Theme): NodeElement => Card({ padding: 1, theme });
export const local = () => [Card({ padding: 1 }), Abs({ padding: 2 }), Panel({ padding: 3 }), Sheet({ padding: 4 }), Pane({ padding: 5 })];
