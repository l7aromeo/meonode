//! Where a call site was written, when the text the host hands the plugin is
//! not the file the author wrote.
//!
//! `__meo$loc` names a call site by the line and column the host's source map
//! gives. That map describes the text SWC parsed. With React Compiler on,
//! Next.js first runs Babel over each client module that may hold a component,
//! and hands SWC the code Babel printed, whether or not React Compiler
//! compiled anything in it. Its lines and columns are not the author's, and the
//! host gives a plugin no map back to them.
//!
//! The file itself is still there. The host maps the project directory into
//! the plugin's sandbox (at `/cwd` under SWC's plugin runner), so the plugin
//! reads it, finds the same call sites in it with the same detection, and pairs
//! each site in the parsed text with the one of the same callee and occurrence
//! in the file: the n-th marked `Div(` with the n-th marked `Div(`. A re-print
//! can move a call ahead of another, but keeps the order of calls to one
//! callee, so pairing within a callee follows a moved call where pairing by
//! position among all sites would not.
//!
//! Where that cannot be done, a site names its file alone, which is true:
//! - a callee with more sites in one text than in the other;
//! - a file that does not parse;
//! - a file the plugin cannot read (outside the project directory, or a module
//!   with no file), when the parsed text is React Compiler's output, which
//!   imports its runtime. Any other module the plugin cannot read keeps the
//!   position it was parsed with, as before.

use std::collections::HashMap;

use swc_core::common::errors::SourceMapper;
use swc_core::common::sync::Lrc;
use swc_core::common::{FileName, Mark, SourceMap, Span};
use swc_core::ecma::ast::{ModuleDecl, ModuleItem, Program};
use swc_core::ecma::parser::{EsSyntax, Syntax, TsSyntax, parse_file_as_module};
use swc_core::ecma::transforms::base::resolver;

use crate::config::CompileConfig;
use crate::partition::recorded_sites;

/// The modules React Compiler's output imports its runtime from: `react` itself
/// from React 19, the `react-compiler-runtime` package for React 17 and 18.
const REACT_COMPILER_RUNTIMES: [&str; 2] = ["react/compiler-runtime", "react-compiler-runtime"];

/// How a module's call sites are located.
pub(crate) enum Positions {
    /// The parsed text is the file, or there is nothing to say it is not: the
    /// host's source map gives the author's positions.
    AsParsed,
    /// The author's `line:column` of each site that could be paired, by the
    /// `lo` of its span in the parsed text. A site missing here names its file
    /// alone.
    Recovered(HashMap<u32, String>),
}

/// How the call sites of `program`, the text the host parsed, are located.
/// `read_source` reads a file by the name the plugin knows it by; `None` when
/// it cannot.
pub(crate) fn of(
    program: &Program,
    filename: &str,
    config: &CompileConfig,
    source_map: &dyn SourceMapper,
    read_source: &dyn Fn(&str) -> Option<String>,
) -> Positions {
    let parsed_sites = recorded_sites(program.clone(), filename, config);
    let Some(first) = parsed_sites.first() else {
        return Positions::AsParsed;
    };
    let parsed = source_map.lookup_char_pos(first.lo).file;
    let Some(authored) = read_source(filename) else {
        return if imports_react_compiler_runtime(program) {
            Positions::Recovered(HashMap::new())
        } else {
            Positions::AsParsed
        };
    };
    if *parsed.src == *authored {
        return Positions::AsParsed;
    }

    let cm: Lrc<SourceMap> = Default::default();
    let file = cm.new_source_file(Lrc::new(FileName::Custom(filename.to_string())), authored);
    let Ok(module) = parse_file_as_module(
        &file,
        syntax_of(filename),
        Default::default(),
        None,
        &mut vec![],
    ) else {
        return Positions::Recovered(HashMap::new());
    };
    let mut original = Program::Module(module);
    original.mutate(resolver(
        Mark::new(),
        Mark::new(),
        filename_is_typescript(filename),
    ));
    let authored_sites = recorded_sites(original, filename, config);

    let by_callee = |sites: &[Span], src: &str, start: u32| {
        let mut groups: HashMap<String, Vec<Span>> = HashMap::new();
        for &site in sites {
            let callee = callee_text(src, (site.lo.0 - start) as usize);
            groups.entry(callee.to_string()).or_default().push(site);
        }
        for group in groups.values_mut() {
            group.sort_by_key(|site| site.lo);
        }
        groups
    };
    let in_parsed = by_callee(&parsed_sites, &parsed.src, parsed.start_pos.0);
    let in_file = by_callee(&authored_sites, &file.src, file.start_pos.0);

    let mut recovered = HashMap::new();
    for (callee, sites) in in_parsed {
        let Some(originals) = in_file
            .get(&callee)
            .filter(|originals| originals.len() == sites.len())
        else {
            continue;
        };
        for (site, original) in sites.iter().zip(originals) {
            let loc = cm.lookup_char_pos(original.lo);
            recovered.insert(site.lo.0, format!("{}:{}", loc.line, loc.col_display + 1));
        }
    }
    Positions::Recovered(recovered)
}

/// The callee a call site starts with: the identifier or `a.b` chain at
/// `offset`, up to its argument list.
fn callee_text(src: &str, offset: usize) -> &str {
    let rest = src.get(offset..).unwrap_or("");
    let end = rest
        .find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$' || c == '.'))
        .unwrap_or(rest.len());
    &rest[..end]
}

/// Whether the module imports React Compiler's runtime, as its output does.
fn imports_react_compiler_runtime(program: &Program) -> bool {
    let Program::Module(module) = program else {
        return false;
    };
    module.body.iter().any(|item| {
        matches!(item, ModuleItem::ModuleDecl(ModuleDecl::Import(import))
            if REACT_COMPILER_RUNTIMES.contains(&import.src.value.as_str().unwrap_or_default()))
    })
}

fn filename_is_typescript(filename: &str) -> bool {
    [".ts", ".tsx", ".mts", ".cts"]
        .iter()
        .any(|ext| filename.ends_with(ext))
}

/// The syntax to parse the author's file with, by its extension.
fn syntax_of(filename: &str) -> Syntax {
    let jsx = filename.ends_with('x');
    if filename_is_typescript(filename) {
        Syntax::Typescript(TsSyntax {
            tsx: jsx,
            ..Default::default()
        })
    } else {
        Syntax::Es(EsSyntax {
            jsx: true,
            ..Default::default()
        })
    }
}
