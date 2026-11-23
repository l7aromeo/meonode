// A module importing @meonode/ui at run time, then for types only: it resolves
// the runtime, so a call of any import is joined, a path alias no rule knows
// (`@src/`) and a package included.
import { Div } from "@meonode/ui";
import { type NodeElement } from "@meonode/ui";
import { Link } from "@src/components/Link";
import Highlighter from "react-syntax-highlighter";
export const a = (): NodeElement => Div({ children: [Link({ padding: 1 }), Highlighter({ margin: 0 })] });
