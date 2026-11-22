// A module that imports @meonode/ui only for types: compiling it adds no import
// of the runtime, so its calls stay as written.
import type { NodeElement } from "@meonode/ui";
import { type Theme } from "@meonode/ui";
import { Box, Row } from "meo-canvas";
import { Card } from "./nodes";
export const scene = Row({ padding: 8, children: [Box({ width: 10 })] });
export const card = (theme: Theme): NodeElement => Card({ padding: 1, theme });
export const plain = () => Card({ padding: 1 });
