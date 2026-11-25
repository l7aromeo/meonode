import { Div } from "@meonode/ui";
// A string after the first statement is outside the prologue: no directive.
'use client';
export const Panel = () => Div({ padding: 8, children: "x" }).render();
