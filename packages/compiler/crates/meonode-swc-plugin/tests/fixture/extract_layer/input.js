import { Div } from "@meonode/ui";
Div({ padding: 4, css: { "@layer base": { color: "red" } } });
Div({ padding: 4, css: { "@media (min-width: 1px)": { "@layer base": { color: "red" } } } });
Div({ padding: 4, css: { "& p": { "@layer base": { color: "red" } } } });
Div({ padding: 4, css: { "@layer": { margin: 0 } } });
