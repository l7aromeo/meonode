import { Div } from "@meonode/ui";
Div({
    color: "black",
    css: {
        "& pre": { margin: 0, "&:hover": { color: "red" } },
        ".dark &": { color: "white" }
    }
});
