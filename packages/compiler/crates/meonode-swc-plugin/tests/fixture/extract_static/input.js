import { Div } from "@meonode/ui";
Div({
    padding: 8,
    color: "red",
    lineHeight: 1.5,
    css: {
        "&:hover": { color: "blue" },
        "@media (min-width: 600px)": { padding: 16 },
        backgroundColor: "theme.surface.default"
    }
});
