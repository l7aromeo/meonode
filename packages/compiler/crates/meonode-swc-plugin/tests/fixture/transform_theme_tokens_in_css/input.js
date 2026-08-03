import { Div } from "@meonode/ui";
Div({
    padding: "theme.spacing.md",
    css: {
        backgroundColor: "theme.base",
        margin: "theme.spacing.sm",
        "@media (max-width: theme.breakpoint.md)": {
            padding: "theme.spacing.sm",
            color: "theme.primary.content"
        },
        "&:hover": {
            backgroundColor: "theme.primary"
        },
        transition: [
            "theme.motion.fast"
        ]
    },
    children: "hi"
});
