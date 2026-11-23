import { Body, Html } from "@meonode/ui";
export default function RootLayout({ children }) {
    return Html({ lang: "en", children: Body({ children }) }).render();
}
