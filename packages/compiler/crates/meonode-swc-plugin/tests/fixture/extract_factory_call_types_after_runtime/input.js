// A module importing @meonode/ui at run time, then for types only: its calls
// are joined.
import { Div } from "@meonode/ui";
import { type NodeElement } from "@meonode/ui";
import { Card } from "./nodes";
export const card = (): NodeElement => Div({ children: Card({ padding: 1 }) });
