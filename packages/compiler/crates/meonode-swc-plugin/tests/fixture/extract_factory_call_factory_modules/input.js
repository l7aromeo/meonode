// Calls of a factoryModules import, which the compiler marks as it marks a
// @meonode/ui call: joined at run time, they keep the marks it gives them with
// extraction off, so generated children stay a list.
import { Div } from "@meonode/ui";
import { Actions, Prose } from "./nodes";
import { Card } from "./cards";
export const a = (items) => Actions({ key: "actions", children: items.map((i) => Div({ key: i, children: i })) });
export const b = () => Prose({ padding: 1, children: "text" });
// An import from another module is not one the compiler marks.
export const c = (items) => Card({ children: items.map((i) => Div({ key: i, children: i })) });
// One the compiler can key but not partition (children read before an effectful
// prop, which partitioning would reorder): marked all the same.
export const d = (items) => Actions({ children: items, title: bump(), padding: 1 });
