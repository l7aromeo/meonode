//! Why call sites stay on the runtime path, recorded for an accounting run
//! (the ignored `explain_files` test below). Only test builds record anything;
//! other builds compile the calls to nothing, so output and API are unchanged.

#[cfg(test)]
use std::cell::RefCell;
#[cfg(test)]
use std::collections::HashMap;

use swc_core::ecma::ast::Expr;
#[cfg(test)]
use swc_core::ecma::ast::{
    BinaryOp, Callee, Decl, MemberExpr, ModuleDecl, ModuleItem, Pat, Program, Stmt,
};
#[cfg(test)]
use swc_core::{atoms::Atom, common::SyntaxContext};

/// One call site the extraction looked at.
#[cfg(test)]
#[derive(Debug, Clone)]
pub struct Site {
    /// Byte position of the call.
    pub pos: u32,
    pub notes: Vec<&'static str>,
    /// What the expressions behind the notes are: `value=…`, `spread=…`,
    /// `css=…`, `key=…`.
    pub details: Vec<String>,
    /// Whether anything was extracted.
    pub extracted: bool,
}

#[cfg(test)]
thread_local! {
    static SITES: RefCell<Vec<Site>> = const { RefCell::new(Vec::new()) };
    static BINDINGS: RefCell<HashMap<(Atom, SyntaxContext), Binding>> = RefCell::new(HashMap::new());
}

/// What a module's top-level name is bound to.
#[cfg(test)]
#[derive(Debug, Clone)]
enum Binding {
    /// Imported from the module named.
    Import(String),
    /// A `const` whose value is an object or array literal.
    ConstObject,
    /// Any other `const`, `let` or `var`.
    Variable,
    Function,
}

/// Reads `program`'s top-level bindings, for classifying expressions.
#[cfg(test)]
pub fn bindings(program: &Program) {
    let mut out = HashMap::new();
    if let Program::Module(module) = program {
        for item in &module.body {
            match item {
                ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => {
                    let source = import.src.value.to_string_lossy().into_owned();
                    for specifier in &import.specifiers {
                        let local = match specifier {
                            swc_core::ecma::ast::ImportSpecifier::Named(s) => &s.local,
                            swc_core::ecma::ast::ImportSpecifier::Default(s) => &s.local,
                            swc_core::ecma::ast::ImportSpecifier::Namespace(s) => &s.local,
                        };
                        out.insert(
                            (local.sym.clone(), local.ctxt),
                            Binding::Import(source.clone()),
                        );
                    }
                }
                ModuleItem::Stmt(Stmt::Decl(decl))
                | ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(
                    swc_core::ecma::ast::ExportDecl { decl, .. },
                )) => match decl {
                    Decl::Var(var) => {
                        for d in &var.decls {
                            if let Pat::Ident(id) = &d.name {
                                let object = matches!(
                                    d.init
                                        .as_deref()
                                        .map(crate::pass_through::unwrap_transparent),
                                    Some(Expr::Object(_) | Expr::Array(_))
                                );
                                out.insert(
                                    (id.id.sym.clone(), id.id.ctxt),
                                    if object {
                                        Binding::ConstObject
                                    } else {
                                        Binding::Variable
                                    },
                                );
                            }
                        }
                    }
                    Decl::Fn(f) => {
                        out.insert((f.ident.sym.clone(), f.ident.ctxt), Binding::Function);
                    }
                    _ => {}
                },
                _ => {}
            }
        }
    }
    BINDINGS.with(|b| *b.borrow_mut() = out);
}

/// The kind of expression `expr` is, for the accounting run.
#[cfg(test)]
fn kind(expr: &Expr) -> String {
    use crate::pass_through::unwrap_transparent;
    let binding = |id: &swc_core::ecma::ast::Ident| {
        BINDINGS.with(|b| b.borrow().get(&(id.sym.clone(), id.ctxt)).cloned())
    };
    fn root(mut e: &Expr) -> &Expr {
        loop {
            match crate::pass_through::unwrap_transparent(e) {
                Expr::Member(MemberExpr { obj, .. }) => e = obj,
                other => return other,
            }
        }
    }
    match unwrap_transparent(expr) {
        Expr::Arrow(_) | Expr::Fn(_) => "theme function".into(),
        Expr::Cond(_) => "conditional with a non-static branch".into(),
        Expr::Bin(b) if matches!(b.op, BinaryOp::LogicalOr | BinaryOp::NullishCoalescing) => {
            "|| or ??".into()
        }
        Expr::Bin(b) if b.op == BinaryOp::LogicalAnd => "&& not provably boolean".into(),
        Expr::Tpl(_) | Expr::Bin(_) | Expr::Unary(_) => {
            "template or arithmetic over non-values".into()
        }
        Expr::Ident(id) => match binding(id) {
            Some(Binding::Import(source)) => format!("imported binding ({source})"),
            Some(Binding::ConstObject) => "same-file const object".into(),
            Some(Binding::Variable) => "same-file non-literal variable".into(),
            Some(Binding::Function) => "same-file function".into(),
            None => "parameter or local (props, destructured prop)".into(),
        },
        Expr::Member(_) => match root(expr) {
            Expr::Ident(id) => match binding(id) {
                Some(Binding::Import(source)) => {
                    format!("member of an imported binding ({source})")
                }
                Some(Binding::ConstObject) => "member of a same-file const object".into(),
                Some(_) => "member of a same-file variable".into(),
                None if id.sym.as_ref() == "theme" => "member of theme".into(),
                None => "member of a parameter or local (props.x)".into(),
            },
            Expr::This(_) => "member of this".into(),
            _ => "member of an expression".into(),
        },
        Expr::Call(call) => match &call.callee {
            Callee::Expr(callee) => match unwrap_transparent(callee) {
                Expr::Ident(id) => match binding(id) {
                    Some(Binding::Import(source)) => {
                        format!("call to an imported function ({}@{source})", id.sym)
                    }
                    Some(_) => format!("call to a same-file function ({})", id.sym),
                    None => format!("call to a parameter or local ({})", id.sym),
                },
                Expr::Member(m) => format!(
                    "method call (.{})",
                    m.prop
                        .as_ident()
                        .map(|i| i.sym.to_string())
                        .unwrap_or_default()
                ),
                _ => "call to an expression".into(),
            },
            _ => "call".into(),
        },
        Expr::Object(_) => "object literal".into(),
        Expr::Array(_) => "array literal".into(),
        Expr::Lit(_) => "literal".into(),
        _ => "other".into(),
    }
}

/// Records what `expr` is, as `<label>=<kind>`.
pub fn classify(label: &'static str, expr: &Expr) {
    #[cfg(test)]
    detail(|| format!("{label}={}", kind(expr)));
    #[cfg(not(test))]
    let _ = (label, expr);
}

/// Records a detail for the call site being looked at, in test builds.
#[cfg(test)]
fn detail(text: impl FnOnce() -> String) {
    let text = text();
    SITES.with(|sites| {
        if let Some(site) = sites.borrow_mut().last_mut() {
            site.details.push(text);
        }
    });
}

/// Starts recording the call site at byte position `pos`.
pub fn begin(pos: u32) {
    #[cfg(test)]
    SITES.with(|sites| {
        sites.borrow_mut().push(Site {
            pos,
            notes: Vec::new(),
            details: Vec::new(),
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
    fn explain(
        path: &str,
        source: String,
    ) -> Vec<(usize, &'static str, Vec<&'static str>, Vec<String>)> {
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
            return vec![(0, "unparsed", Vec::new(), Vec::new())];
        };
        GLOBALS.set(&Globals::new(), || {
            program.visit_mut_with(&mut resolver(Mark::new(), Mark::new(), syntax.typescript()));
            super::bindings(&program);
            partition::transform_program(&mut program, path, &config, None);
        });
        super::take()
            .into_iter()
            .map(|site| {
                let line = cm.lookup_char_pos(swc_core::common::BytePos(site.pos)).line;
                let outcome = if site.extracted {
                    "extracted"
                } else {
                    "runtime"
                };
                let mut notes: Vec<&'static str> = site.notes.clone();
                notes.dedup();
                (line, outcome, notes, site.details)
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
            explain("sites.js", source.to_string())
                .into_iter()
                .map(|(line, outcome, notes, _)| (line, outcome, notes))
                .collect::<Vec<_>>(),
            vec![
                (2, "extracted", vec![]),
                (3, "runtime", vec!["a value left to the runtime"]),
                (4, "runtime", vec!["a spread among the call's props"]),
                (5, "extracted", vec![]),
                (6, "extracted", vec![]),
            ]
        );
    }

    #[test]
    fn records_what_a_runtime_value_or_spread_is() {
        let source = r#"import { Div } from '@meonode/ui'
import { tone } from './tone'
const base = { color: 'red' }
const shade = tone.dark
export const a = () => Div({ ...base, padding: 4 })
export const b = (p) => Div({ color: tone, padding: (t) => t.gap })
"#;
        let details: Vec<Vec<String>> = explain("kinds.js", source.to_string())
            .into_iter()
            .map(|(_, _, _, details)| details)
            .collect();
        assert_eq!(
            details,
            vec![
                vec!["spread=same-file const object".to_string()],
                vec![
                    "value=imported binding (./tone)".to_string(),
                    "value=theme function".to_string(),
                ],
            ]
        );
        let source = r#"import { Div } from '@meonode/ui'
import { tone } from './tone'
const shade = tone.dark
export const a = (p) => Div({ color: p.color, margin: tone.gap, padding: shade })
"#;
        assert_eq!(
            explain("kinds.js", source.to_string())[0].3,
            vec![
                "value=member of a parameter or local (props.x)".to_string(),
                "value=member of an imported binding (./tone)".to_string(),
                "value=same-file non-literal variable".to_string(),
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
            for (line, outcome, notes, details) in explain(path, source) {
                writeln!(
                    out,
                    "{path}\t{line}\t{outcome}\t{}\t{}",
                    notes.join(" | "),
                    details.join(" | ")
                )
                .unwrap();
            }
        }
        std::fs::write(out_path, out).expect("write");
    }
}
