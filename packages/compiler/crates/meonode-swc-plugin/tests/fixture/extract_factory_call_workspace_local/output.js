import { __meoFactoryCall } from "@meonode/ui/factory-call";
// A known limit: in such a package, a call of its own capitalized function in
// node position is joined like any local import's, so the module gains an
// import of @meonode/ui/factory-call, which its package may not resolve.
import { Frame } from "./frame";
const __meoSite0 = {
    at: 0,
    r: 1
};
export function GET() {
    return __meoFactoryCall(Frame, __meoSite0, {
        width: 1200
    });
}
