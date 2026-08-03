import { Div } from "@meonode/ui";
Div({
    __meo$: 2,
    __meo$c: {
        padding: "var(--meonode-theme-spacing-md--len, var(--meonode-theme-spacing-md))"
    },
    __meo$k: "m1jojpccgseqij",
    __meo$dyn: [
        "css"
    ],
    css: {
        backgroundColor: "var(--meonode-theme-base)",
        margin: "var(--meonode-theme-spacing-sm--len, var(--meonode-theme-spacing-sm))",
        "@media (max-width: theme.breakpoint.md)": {
            padding: "var(--meonode-theme-spacing-sm--len, var(--meonode-theme-spacing-sm))",
            color: "var(--meonode-theme-primary-content)"
        },
        "&:hover": {
            backgroundColor: "var(--meonode-theme-primary)"
        },
        transition: [
            "theme.motion.fast"
        ]
    },
    children: "hi"
});
