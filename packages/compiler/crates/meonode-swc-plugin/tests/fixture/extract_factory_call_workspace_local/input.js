// A known limit: in such a package, a call of its own capitalized function in
// node position is joined like any local import's, so the module gains an
// import of @meonode/ui/factory-call, which its package may not resolve.
import { Frame } from "./frame";
export function GET() {
    return Frame({ width: 1200 });
}
