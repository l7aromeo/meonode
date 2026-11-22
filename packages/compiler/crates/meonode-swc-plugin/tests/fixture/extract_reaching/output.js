import { registerStaticCss as __meoCss } from "@meonode/ui";
import { Div } from "@meonode/ui";
__meoCss("3l5vfo61dfx4a", [
    [
        0,
        "mn-0qaad860omepl",
        ".mn-0qaad860omepl>*{color:red;}"
    ],
    [
        1,
        "mn-0e47bwo0vm4o6",
        ".mn-0e47bwo0vm4o6{-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;}"
    ],
    [
        1,
        "mn-35l163g1tjy26",
        ".mn-35l163g1tjy26{min-height:0;}"
    ],
    [
        1,
        "mn-0zzfi4vug0nqv",
        ".mn-0zzfi4vug0nqv{min-width:0;}"
    ],
    [
        4,
        "mn-0vykcr23tywbm",
        ".dark .mn-0vykcr23tywbm{color:white;}.x:has(.mn-0vykcr23tywbm){color:blue;}"
    ],
    [
        0,
        "mn-3fn471nznxzqi",
        ".dark .mn-3fn471nznxzqi .x{color:green;}.mn-3fn471nznxzqi+.y{margin:0;}"
    ],
    [
        4,
        "mn-3pirq8qyw1bak",
        ".dark .mn-3pirq8qyw1bak{color:red;}"
    ]
]);
// Later elements only: one rule in the reaching bucket.
Div({
    __meo$: 2,
    __meo$s: "mn-0qaad860omepl mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "m25citwhoamdhj"
});
// The node and an earlier element: one rule in the per-node bucket.
Div({
    __meo$: 2,
    __meo$s: "mn-0vykcr23tywbm mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "myr283o0fo15o"
});
// Both: one class in each bucket, nested rules split by where they reach.
Div({
    __meo$: 2,
    __meo$s: "mn-3fn471nznxzqi mn-3pirq8qyw1bak mn-0e47bwo0vm4o6 mn-35l163g1tjy26 mn-0zzfi4vug0nqv",
    __meo$k: "m3mib4nrri57ew"
});
// A list reaching both sides of the node stays on the runtime path.
Div({
    __meo$: 2,
    __meo$k: "m1bg3byk1roqu3",
    __meo$dyn: [
        "css"
    ],
    css: {
        "&, & p": {
            color: "red"
        }
    }
});
// An element that may render on either side stays on the runtime path.
Div({
    __meo$: 2,
    __meo$k: "m1azz5bgaclnnk",
    __meo$dyn: [
        "css"
    ],
    css: {
        ".x:has(&) p": {
            color: "red"
        }
    }
});
