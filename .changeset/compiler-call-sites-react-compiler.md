---
"@meonode/compiler": patch
---

With `callSiteLocations` and Next.js `reactCompiler`, a client note now names the line and column the author wrote. Next.js has Babel re-print each client module that may hold a component before SWC parses it, whether or not React Compiler compiles anything in it, so `__meo$loc` named Babel's lines: off by up to 120 in the apps measured. The plugin now reads the file from the project directory, finds the same call sites in it and pairs them by callee and occurrence. Where it cannot pair a call, the note names the file alone. With the option off, the output is unchanged. The wasm grows by 0.64 MB (0.20 MB gzipped) for the parser (Fixes [#185](https://github.com/l7aromeo/meonode/issues/185)).
