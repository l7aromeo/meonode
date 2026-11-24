import { Div } from "@meonode/ui";
export const a = (p) => Div({ padding: 4, css: { "&:hover": { color: `${p.color}` } } });
export const b = (p) => Div({ padding: 4, css: { "@media (min-width: 1px)": { marginTop: p.on ? 4 : 8 } } });
export const c = (p) => Div({ padding: 4, css: { ".dark &": { color: p.on ? "blue" : "green", marginTop: p.n * 2 } } });
export const d = (p) => Div({ padding: 4, css: { "&:hover": { color: p.on ? "blue" : undefined } } });
export const e = (p) => Div({ padding: 4, css: { "& > p": { color: `${p.color}` } } });
export const f = (p) => Div({ padding: 4, css: { "&:hover": { userSelect: `${p.color}` } } });
export const g = (p) => Div({ padding: 4, css: { "&:where(.x)": { color: `${p.color}` }, "&::before": { content: `"${p.color}"` } } });
