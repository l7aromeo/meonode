// A module of a package that does not depend on @meonode/ui (a workspace
// package the app compiles, say), calling a library's functions: left as
// written, so it gains no import its package could not resolve.
import { Box, Column } from "meo-canvas";
export function GET() {
    return Column({ gap: 8, children: [Box({ width: 1200, height: 630 })] });
}
