import { Div } from "@meonode/ui";
Div({ marginTop: 2, color: "rgb(150, 0, 0)", css: { "& + &": { marginTop: 10 } } });
Div({ padding: 4, css: { "& ~ &": { color: "red" } } });
Div({ padding: 4, css: { "& &": { color: "red" } } });
Div({ padding: 4, css: { "&:hover + &": { color: "red" } } });
Div({ padding: 4, css: { "& > p": { "& + &": { color: "red" } } } });
Div({ padding: 4, css: { "& + div": { color: "red" } } });
