'use client'
// The directive stays first: the added imports and registration go after it.
import { Div } from "@meonode/ui";
import { Card } from "./nodes";
export const Panel = () => Div({ padding: 8, children: Card({ margin: 2 }) }).render();
