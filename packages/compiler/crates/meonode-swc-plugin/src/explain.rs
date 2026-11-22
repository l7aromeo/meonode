//! Why call sites stay on the runtime path, recorded for an accounting run
//! (the ignored `explain_files` test below). Only test builds record anything;
//! other builds compile the calls to nothing, so output and API are unchanged.

#[cfg(test)]
use std::cell::RefCell;

/// The note marking a call site extracted in part.
pub const PARTIAL: &str = "partial";

/// One call site the extraction looked at.
#[cfg(test)]
#[derive(Debug, Clone)]
pub struct Site {
    /// Byte position of the call.
    pub pos: u32,
    pub notes: Vec<&'static str>,
    /// Whether anything was extracted.
    pub extracted: bool,
}

#[cfg(test)]
thread_local! {
    static SITES: RefCell<Vec<Site>> = const { RefCell::new(Vec::new()) };
}

/// Starts recording the call site at byte position `pos`.
pub fn begin(pos: u32) {
    #[cfg(test)]
    SITES.with(|sites| {
        sites.borrow_mut().push(Site {
            pos,
            notes: Vec::new(),
            extracted: false,
        })
    });
    #[cfg(not(test))]
    let _ = pos;
}

/// Records `reason` for the call site being looked at.
pub fn note(reason: &'static str) {
    #[cfg(test)]
    SITES.with(|sites| {
        if let Some(site) = sites.borrow_mut().last_mut() {
            site.notes.push(reason);
        }
    });
    #[cfg(not(test))]
    let _ = reason;
}

/// `None`, after recording `reason`: a call site left whole to the runtime.
pub fn bail<T>(reason: &'static str) -> Option<T> {
    note(reason);
    None
}

/// Ends the call site being looked at.
pub fn finish(extracted: bool) {
    #[cfg(test)]
    SITES.with(|sites| {
        if let Some(site) = sites.borrow_mut().last_mut() {
            site.extracted = extracted;
        }
    });
    #[cfg(not(test))]
    let _ = extracted;
}

/// The call sites recorded since the last call, emptied.
#[cfg(test)]
pub fn take() -> Vec<Site> {
    SITES.with(|sites| std::mem::take(&mut *sites.borrow_mut()))
}

#[cfg(test)]
mod tests {
    use std::fmt::Write as _;

    use swc_core::common::{FileName, GLOBALS, Globals, Mark, SourceMap, sync::Lrc};
    use swc_core::ecma::parser::{EsSyntax, Syntax, TsSyntax, parse_file_as_program};
    use swc_core::ecma::transforms::base::resolver;
    use swc_core::ecma::visit::VisitMutWith;

    use crate::config::CompileConfig;
    use crate::partition;

    /// Each call site extraction looked at in `source`: line, outcome
    /// (`extracted`, `partial` or `runtime`) and the reasons noted, in order.
    fn explain(path: &str, source: String) -> Vec<(usize, &'static str, Vec<&'static str>)> {
        let config = CompileConfig {
            experimental_extract_css: true,
            ..CompileConfig::default()
        };
        let cm: Lrc<SourceMap> = Default::default();
        let fm = cm.new_source_file(Lrc::new(FileName::Real(path.into())), source);
        let syntax = if path.ends_with(".ts") || path.ends_with(".tsx") || path.ends_with(".mts") {
            Syntax::Typescript(TsSyntax {
                tsx: path.ends_with(".tsx"),
                ..Default::default()
            })
        } else {
            Syntax::Es(EsSyntax {
                jsx: true,
                ..Default::default()
            })
        };
        let Ok(mut program) =
            parse_file_as_program(&fm, syntax, Default::default(), None, &mut Vec::new())
        else {
            return vec![(0, "unparsed", Vec::new())];
        };
        GLOBALS.set(&Globals::new(), || {
            program.visit_mut_with(&mut resolver(Mark::new(), Mark::new(), syntax.typescript()));
            partition::transform_program(&mut program, path, &config, None);
        });
        super::take()
            .into_iter()
            .map(|site| {
                let line = cm.lookup_char_pos(swc_core::common::BytePos(site.pos)).line;
                let outcome = if !site.extracted {
                    "runtime"
                } else if site.notes.contains(&super::PARTIAL) {
                    "partial"
                } else {
                    "extracted"
                };
                let mut notes: Vec<&'static str> = site
                    .notes
                    .into_iter()
                    .filter(|n| *n != super::PARTIAL)
                    .collect();
                notes.dedup();
                (line, outcome, notes)
            })
            .collect()
    }

    #[test]
    fn records_why_each_call_site_stays_on_the_runtime_path() {
        let source = r#"import { Div } from '@meonode/ui'
export const a = () => Div({ color: 'red' })
export const b = (p) => Div({ color: 'red', padding: p.pad })
export const c = (p) => Div({ ...p, color: 'red' })
export const d = () => Div({ css: { '& + &': { color: 'red' } } })
export const e = () => Div({ padding: '1px', paddingTop: '2px' })
"#;
        assert_eq!(
            explain("sites.js", source.to_string()),
            vec![
                (2, "extracted", vec![]),
                (3, "partial", vec!["a value left to the runtime"]),
                (4, "runtime", vec!["a spread among the call's props"]),
                (5, "runtime", vec!["a selector naming the node twice"]),
                (
                    6,
                    "runtime",
                    vec!["overlapping properties in one context", "nothing extracted"]
                ),
            ]
        );
    }

    /// For each file named in `MEONODE_EXPLAIN_FILES` (one path per line),
    /// every call site extraction looked at, as tab-separated lines in
    /// `MEONODE_EXPLAIN_OUT`: file, line, `extracted`/`partial`/`runtime`, and
    /// the reasons noted, joined by ` | `.
    ///
    ///   MEONODE_EXPLAIN_FILES=files.txt MEONODE_EXPLAIN_OUT=out.tsv \
    ///     cargo test --lib explain_files -- --ignored
    #[test]
    #[ignore = "an accounting run over files named in the environment"]
    fn explain_files() {
        let list = std::env::var("MEONODE_EXPLAIN_FILES").expect("MEONODE_EXPLAIN_FILES");
        let out_path = std::env::var("MEONODE_EXPLAIN_OUT").expect("MEONODE_EXPLAIN_OUT");
        let mut out = String::new();
        for path in std::fs::read_to_string(list)
            .expect("file list")
            .lines()
            .filter(|l| !l.is_empty())
        {
            let source = std::fs::read_to_string(path).expect(path);
            for (line, outcome, notes) in explain(path, source) {
                writeln!(out, "{path}\t{line}\t{outcome}\t{}", notes.join(" | ")).unwrap();
            }
        }
        std::fs::write(out_path, out).expect("write");
    }
}
