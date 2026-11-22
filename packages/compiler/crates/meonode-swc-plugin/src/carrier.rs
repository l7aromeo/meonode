//! Carrier marks: `__meo$r: 1` on the named nodes that carry a run of named
//! styles.
//!
//! A walk is one outermost host factory call, read in pre-order: its named
//! nodes (`__meo$n` or `__meo$t`, no `__meo$c`), its runtime nodes (`__meo$c`),
//! the components among its children, and its start and end. A host that is a
//! runtime node only on some renders (a `css` read at run time, or a host call
//! left uncompiled) is no cut. Named nodes keep no element of their own for their
//! styles, so the styles of a stretch of them between two cuts go in at a
//! node that renders: a runtime node at either end takes them, as it takes its
//! own. A stretch with no runtime node at either end needs a carrier, which
//! renders through `StyledRenderer` and inserts the stretch's styles there.
//!
//! A carrier is the stretch's first named node, so its styles go in before
//! everything after it. The mark is a call site's, the same on every render,
//! so a node never changes its element type between renders: a named node is
//! marked when, for some combination of its conditions, it is first in a
//! stretch whose left end is the walk's start or a component and whose right
//! end is a component or the walk's end. Over a conditional, a spread and a
//! generated list every member is optional, and a `.map()` item is read twice
//! so an item's first node sees the end of the item before it.

use std::collections::HashSet;

use swc_core::common::Spanned;
use swc_core::ecma::ast::*;
use swc_core::ecma::visit::{Visit, VisitMut, VisitMutWith, VisitWith};

use crate::extract::{ModuleScope, NAME_KEY, TEMPLATE_KEY};
use crate::pass_through::unwrap_transparent;

/// Marker key of a named node chosen to carry the run of named styles that
/// begins at it.
pub const CARRIER_KEY: &str = "__meo$r";

/// The compiled marker's key: present on every compiled call site's props.
const MARKER_KEY: &str = "__meo$";
/// The bucket of styles left to the runtime: its node renders through `StyledRenderer`.
const CSS_KEY: &str = "__meo$c";
/// The bucket of DOM props, which may hold `children`.
const DOM_KEY: &str = "__meo$d";

/// What a position of a walk is, read in pre-order.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
enum Kind {
    Start,
    End,
    /// A named node: its styles are a call site's, inserted by whatever carries them.
    Named,
    /// A node rendering through `StyledRenderer`, which inserts styles itself.
    Runtime,
    /// A host with no styles.
    Plain,
    /// A child that may be a component, which renders on its own.
    Component,
}

/// A call site, by its span.
type Site = (u32, u32);

#[derive(Clone, Copy, Debug)]
struct Token {
    kind: Kind,
    optional: bool,
    site: Option<Site>,
}

fn site_of(call: &CallExpr) -> Site {
    (call.span.lo.0, call.span.hi.0)
}

/// The name of an object literal's key, when it is an identifier or a string.
fn key_name(prop: &PropOrSpread) -> Option<&str> {
    let PropOrSpread::Prop(prop) = prop else {
        return None;
    };
    let Prop::KeyValue(kv) = &**prop else {
        return None;
    };
    match &kv.key {
        PropName::Ident(id) => Some(id.sym.as_ref()),
        PropName::Str(s) => s.value.as_str(),
        _ => None,
    }
}

fn value_of<'a>(obj: &'a ObjectLit, name: &str) -> Option<&'a Expr> {
    obj.props.iter().find_map(|p| {
        if key_name(p) != Some(name) {
            return None;
        }
        let PropOrSpread::Prop(prop) = p else { return None };
        let Prop::KeyValue(kv) = &**prop else { return None };
        Some(&*kv.value)
    })
}

fn has_key(obj: &ObjectLit, name: &str) -> bool {
    obj.props.iter().any(|p| key_name(p) == Some(name))
}

/// The props object of a host call: the one holding the compiled marker, else
/// the first object literal among its arguments.
fn props_of(call: &CallExpr) -> Option<&ObjectLit> {
    let objects = || {
        call.args.iter().filter_map(|a| match unwrap_transparent(&a.expr) {
            Expr::Object(obj) if a.spread.is_none() => Some(obj),
            _ => None,
        })
    };
    objects().find(|o| has_key(o, MARKER_KEY)).or_else(|| objects().next())
}

/// A host call's children: its `children` prop, in the DOM bucket or not, or a
/// positional first argument that is not its props.
fn children_of(call: &CallExpr) -> Option<&Expr> {
    let props = props_of(call);
    if let Some(children) = props.and_then(|p| value_of(p, "children")) {
        return Some(children);
    }
    if let Some(Expr::Object(dom)) = props.and_then(|p| value_of(p, DOM_KEY)).map(unwrap_transparent)
        && let Some(children) = value_of(dom, "children")
    {
        return Some(children);
    }
    let first = call.args.first()?;
    if first.spread.is_some() || matches!(unwrap_transparent(&first.expr), Expr::Object(_)) {
        return None;
    }
    Some(&first.expr)
}

fn is_map(call: &CallExpr) -> bool {
    matches!(&call.callee, Callee::Expr(callee)
        if matches!(&**callee, Expr::Member(m) if matches!(&m.prop, MemberProp::Ident(p) if p.sym.as_ref() == "map")))
}

/// What a `.map()` callback returns: its expression body, or the arguments of
/// the return statements of its block, not of functions inside it.
fn map_returns(call: &CallExpr) -> Vec<&Expr> {
    struct Returns<'a>(Vec<&'a Expr>);
    impl<'a> Returns<'a> {
        fn stmts(&mut self, stmts: &'a [Stmt]) {
            for stmt in stmts {
                self.stmt(stmt);
            }
        }
        fn stmt(&mut self, stmt: &'a Stmt) {
            match stmt {
                Stmt::Return(ReturnStmt { arg: Some(arg), .. }) => self.0.push(arg),
                Stmt::Block(b) => self.stmts(&b.stmts),
                Stmt::If(i) => {
                    self.stmt(&i.cons);
                    if let Some(alt) = &i.alt {
                        self.stmt(alt);
                    }
                }
                Stmt::Switch(s) => s.cases.iter().for_each(|c| self.stmts(&c.cons)),
                Stmt::Try(t) => {
                    self.stmts(&t.block.stmts);
                    if let Some(h) = &t.handler {
                        self.stmts(&h.body.stmts);
                    }
                }
                Stmt::For(f) => self.stmt(&f.body),
                Stmt::ForIn(f) => self.stmt(&f.body),
                Stmt::ForOf(f) => self.stmt(&f.body),
                Stmt::While(w) => self.stmt(&w.body),
                Stmt::DoWhile(d) => self.stmt(&d.body),
                Stmt::Labeled(l) => self.stmt(&l.body),
                _ => {}
            }
        }
    }
    let Some(callback) = call.args.first() else {
        return Vec::new();
    };
    let mut returns = Returns(Vec::new());
    match unwrap_transparent(&callback.expr) {
        Expr::Arrow(arrow) => match &*arrow.body {
            ArrowFunctionBody::Expr(e) => returns.0.push(e),
            ArrowFunctionBody::FunctionBody(b) => returns.stmts(&b.stmts),
        },
        Expr::Fn(f) => {
            if let Some(body) = &f.function.body {
                returns.stmts(&body.stmts);
            }
        }
        _ => {}
    }
    returns.0
}

/// Reads walks and collects the carriers' call sites.
struct Walks<'a> {
    scope: &'a ModuleScope,
    /// Host calls already read as part of a walk.
    consumed: HashSet<Site>,
    carriers: HashSet<Site>,
}

impl Walks<'_> {
    fn is_host(&self, call: &CallExpr) -> bool {
        self.scope.extractable_factory(call).is_some()
    }

    fn emit(&mut self, expr: &Expr, optional: bool, out: &mut Vec<Token>) {
        let push = |out: &mut Vec<Token>, kind| out.push(Token { kind, optional, site: None });
        match unwrap_transparent(expr) {
            Expr::Lit(_) | Expr::Tpl(_) => {}
            Expr::Ident(id) if id.sym.as_ref() == "undefined" => {}
            Expr::Unary(u) if u.op == UnaryOp::Void => {}
            Expr::Cond(c) => {
                self.emit(&c.cons, true, out);
                self.emit(&c.alt, true, out);
            }
            Expr::Bin(b) if b.op == BinaryOp::LogicalAnd => self.emit(&b.right, true, out),
            Expr::Bin(b) if matches!(b.op, BinaryOp::LogicalOr | BinaryOp::NullishCoalescing) => {
                self.emit(&b.left, true, out);
                self.emit(&b.right, true, out);
            }
            Expr::Array(array) => {
                for elem in array.elems.iter().flatten() {
                    if elem.spread.is_none() {
                        self.emit(&elem.expr, optional, out);
                        continue;
                    }
                    // A spread of literals and branches over them is read
                    // through, every member optional; any other is opaque.
                    match unwrap_transparent(&elem.expr) {
                        Expr::Call(call) if is_map(call) => self.emit_list(call, out),
                        inner @ (Expr::Array(_) | Expr::Cond(_)) => self.emit(inner, true, out),
                        inner @ Expr::Bin(b) if matches!(b.op, BinaryOp::LogicalAnd | BinaryOp::LogicalOr | BinaryOp::NullishCoalescing) => {
                            self.emit(inner, true, out)
                        }
                        _ => out.push(Token { kind: Kind::Component, optional: true, site: None }),
                    }
                }
            }
            Expr::Call(call) if is_map(call) => self.emit_list(call, out),
            Expr::Call(call) if self.is_host(call) => {
                let site = site_of(call);
                self.consumed.insert(site);
                let kind = match props_of(call).filter(|props| has_key(props, MARKER_KEY)) {
                    // Styles the runtime always has: it renders through `StyledRenderer`.
                    Some(props) if has_key(props, CSS_KEY) => Kind::Runtime,
                    Some(props) if has_key(props, NAME_KEY) || has_key(props, TEMPLATE_KEY) => Kind::Named,
                    // No styles, a `css` read at run time (the compiler moves
                    // static styles beside it to `__meo$c`), or a host call left
                    // uncompiled: a cut only on renders where it holds a style.
                    // A cut that may be absent marks as an absent one does.
                    _ => Kind::Plain,
                };
                out.push(Token { kind, optional, site: Some(site) });
                if let Some(children) = children_of(call) {
                    self.emit(children, optional, out);
                }
            }
            Expr::JSXElement(element) => {
                let host = matches!(&element.opening.name, JSXElementName::Ident(id) if id.sym.starts_with(|c: char| c.is_ascii_lowercase()));
                push(out, if host { Kind::Plain } else { Kind::Component });
            }
            _ => push(out, Kind::Component),
        }
    }

    /// A generated list's items: the callback's results, twice, all optional.
    fn emit_list(&mut self, call: &CallExpr, out: &mut Vec<Token>) {
        let returns = map_returns(call);
        if returns.is_empty() {
            out.push(Token { kind: Kind::Component, optional: true, site: None });
            return;
        }
        for _ in 0..2 {
            for r in &returns {
                self.emit(r, true, out);
            }
        }
    }

    /// Marks each named node of the walk that may begin a stretch needing a carrier.
    fn choose(&mut self, tokens: &[Token]) {
        let is_cut = |k: Kind| !matches!(k, Kind::Named | Kind::Plain);
        for (i, token) in tokens.iter().enumerate() {
            if token.kind != Kind::Named {
                continue;
            }
            let mut left = HashSet::new();
            for other in tokens[..i].iter().rev() {
                match other.kind {
                    Kind::Plain => continue,
                    Kind::Named if other.optional => continue,
                    Kind::Named => break,
                    kind => {
                        left.insert(kind);
                        if !other.optional {
                            break;
                        }
                    }
                }
            }
            if !(left.contains(&Kind::Start) || left.contains(&Kind::Component)) {
                continue;
            }
            let right_needs = tokens[i + 1..]
                .iter()
                .filter(|o| is_cut(o.kind))
                .scan(false, |stopped, o| {
                    if *stopped {
                        return None;
                    }
                    *stopped = !o.optional;
                    Some(o.kind)
                })
                .any(|k| matches!(k, Kind::Component | Kind::End));
            if right_needs && let Some(site) = token.site {
                self.carriers.insert(site);
            }
        }
    }
}

impl Visit for Walks<'_> {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if self.is_host(call) && !self.consumed.contains(&site_of(call)) {
            let mut tokens = vec![Token { kind: Kind::Start, optional: false, site: None }];
            self.emit(&Expr::Call(call.clone()), false, &mut tokens);
            tokens.push(Token { kind: Kind::End, optional: false, site: None });
            self.choose(&tokens);
        }
        call.visit_children_with(self);
    }
}

/// Adds the mark to the carriers' compiled props.
struct Marker<'a>(&'a HashSet<Site>);

impl VisitMut for Marker<'_> {
    fn visit_mut_call_expr(&mut self, call: &mut CallExpr) {
        call.visit_mut_children_with(self);
        if !self.0.contains(&site_of(call)) {
            return;
        }
        for arg in &mut call.args {
            let Expr::Object(obj) = &mut *arg.expr else { continue };
            if !has_key(obj, MARKER_KEY) || has_key(obj, CARRIER_KEY) {
                continue;
            }
            let at = obj
                .props
                .iter()
                .position(|p| matches!(key_name(p), Some(k) if k == NAME_KEY || k == TEMPLATE_KEY))
                .map_or(obj.props.len(), |i| i + 1);
            obj.props.insert(
                at,
                PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                    key: PropName::Ident(IdentName::new(CARRIER_KEY.into(), obj.span())),
                    value: Box::new(Expr::Lit(Lit::Num(Number::from(1.0)))),
                }))),
            );
            return;
        }
    }
}

/// Marks the carriers of every walk in `module`.
pub fn mark(module: &mut Module, scope: &ModuleScope) {
    let mut walks = Walks {
        scope,
        consumed: HashSet::new(),
        carriers: HashSet::new(),
    };
    module.visit_with(&mut walks);
    if !walks.carriers.is_empty() {
        module.visit_mut_with(&mut Marker(&walks.carriers));
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use swc_core::common::sync::Lrc;
    use swc_core::common::{FileName, GLOBALS, Globals, Mark, SourceMap};
    use swc_core::ecma::ast::*;
    use swc_core::ecma::parser::lexer::Lexer;
    use swc_core::ecma::parser::{EsSyntax, Parser, StringInput, Syntax};
    use swc_core::ecma::transforms::base::resolver;
    use swc_core::ecma::visit::{Visit, VisitMutWith, VisitWith};

    use super::CARRIER_KEY;
    use crate::config::CompileConfig;
    use crate::partition::transform_program;

    const IMPORTS: &str = "import { Div, Span, Node } from '@meonode/ui'\nimport { Card } from './card'\n";

    /// The `data-i` of every call site the transform marks as a carrier, for
    /// `src` after the imports, with extraction on or off.
    fn carriers_with(src: &str, extract: bool) -> BTreeSet<i64> {
        let src = format!("{IMPORTS}{src}");
        GLOBALS.set(&Globals::new(), || {
            let cm: Lrc<SourceMap> = Default::default();
            let fm = cm.new_source_file(Lrc::new(FileName::Anon), src.clone());
            let lexer = Lexer::new(Syntax::Es(EsSyntax::default()), EsVersion::EsNext, StringInput::from(&*fm), None);
            let mut program = Parser::new_from(lexer)
                .parse_program()
                .unwrap_or_else(|e| panic!("failed to parse: {e:?}\n{src}"));
            program.visit_mut_with(&mut resolver(Mark::new(), Mark::new(), false));
            let config = CompileConfig {
                experimental_extract_css: extract,
                ..CompileConfig::default()
            };
            transform_program(&mut program, "test.ts", &config, Some(&*cm));

            struct Collector(BTreeSet<i64>);
            impl Visit for Collector {
                fn visit_object_lit(&mut self, obj: &ObjectLit) {
                    let key = |p: &PropOrSpread, name: &str| match p {
                        PropOrSpread::Prop(p) => match &**p {
                            Prop::KeyValue(kv) => match &kv.key {
                                PropName::Ident(id) => id.sym.as_ref() == name,
                                PropName::Str(s) => s.value.as_str() == Some(name),
                                _ => false,
                            },
                            _ => false,
                        },
                        _ => false,
                    };
                    if obj.props.iter().any(|p| key(p, CARRIER_KEY)) {
                        // `data-i` sits in the DOM bucket, or beside the marker.
                        let mut id = None;
                        let mut find = |o: &ObjectLit| {
                            for p in &o.props {
                                if let PropOrSpread::Prop(p) = p
                                    && let Prop::KeyValue(kv) = &**p
                                    && let PropName::Str(s) = &kv.key
                                    && s.value.as_str() == Some("data-i")
                                    && let Expr::Lit(Lit::Num(n)) = &*kv.value
                                {
                                    id = Some(n.value as i64);
                                }
                            }
                        };
                        find(obj);
                        for p in &obj.props {
                            if key(p, "__meo$d")
                                && let PropOrSpread::Prop(p) = p
                                && let Prop::KeyValue(kv) = &**p
                                && let Expr::Object(d) = &*kv.value
                            {
                                find(d);
                            }
                        }
                        self.0.insert(id.unwrap_or(-1));
                    }
                    obj.visit_children_with(self);
                }
            }
            let mut collector = Collector(BTreeSet::new());
            program.visit_with(&mut collector);
            collector.0
        })
    }

    fn carriers(src: &str) -> BTreeSet<i64> {
        carriers_with(src, true)
    }

    fn set(ids: &[i64]) -> BTreeSet<i64> {
        ids.iter().copied().collect()
    }

    #[test]
    fn marks_a_named_root_before_a_component() {
        assert_eq!(carriers("export const P = () => Div({ padding: 1, 'data-i': 0, children: [Card()] })"), set(&[0]));
    }

    #[test]
    fn leaves_a_run_a_runtime_node_takes_unmarked() {
        // The runtime node right after the root carries the root's run.
        assert_eq!(
            carriers("export const P = (w) => Div({ padding: 1, 'data-i': 0, children: [Div({ width: w, 'data-i': 1 }), Card()] })"),
            set(&[])
        );
    }

    #[test]
    fn marks_the_first_named_node_between_two_components() {
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Card(), Span('a', { color: 'red', 'data-i': 1 }), Span('b', { color: 'blue', 'data-i': 2 }), Card()] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn leaves_a_stretch_ending_at_a_runtime_node_unmarked() {
        assert_eq!(
            carriers("export const P = (w) => Div({ width: w, children: [Card(), Span('a', { color: 'red', 'data-i': 1 }), Div({ width: w })] })"),
            set(&[])
        );
    }

    #[test]
    fn leaves_a_stretch_after_a_runtime_node_unmarked() {
        // The runtime node before it takes the run, after its own rule.
        assert_eq!(
            carriers("export const P = (w) => Div({ width: w, children: [Card(), Div({ width: w }), Span('a', { color: 'red', 'data-i': 1 }), Card()] })"),
            set(&[])
        );
    }

    #[test]
    fn looks_past_an_optional_runtime_node_to_the_component_before_it() {
        // Without the runtime node, the stretch begins after the component.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), s.a && Div({ width: w }), Span('a', { color: 'red', 'data-i': 1 }), Card()] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn looks_past_a_css_read_at_run_time_to_the_component_before_it() {
        // An empty `css` leaves that node unstyled, and the stretch begins after the component.
        assert_eq!(
            carriers("export const P = (w, s) => Div({ width: w, children: [Card(), Div({ css: s.css }), Span('a', { color: 'red', 'data-i': 1 }), Card()] })"),
            set(&[1])
        );
    }

    #[test]
    fn looks_past_an_uncompiled_host_to_the_component_before_it() {
        // Its props may hold no style, and the stretch begins after the component.
        assert_eq!(
            carriers("export const P = (w, s) => Div({ width: w, children: [Card(), Div(s.props), Span('a', { color: 'red', 'data-i': 1 }), Card()] })"),
            set(&[1])
        );
    }

    #[test]
    fn leaves_static_styles_beside_a_css_read_at_run_time_to_the_runtime() {
        // They go in `__meo$c` with the `css`, so the node is a runtime node.
        assert_eq!(
            carriers("export const P = (w, s) => Div({ width: w, children: [Card(), Div({ padding: 1, css: s.css, 'data-i': 1 }), Card()] })"),
            set(&[])
        );
    }

    #[test]
    fn marks_a_stretch_ending_at_the_walk_end() {
        assert_eq!(
            carriers("export const P = (w) => Div({ width: w, children: [Card(), Span('a', { color: 'red', 'data-i': 1 })] })"),
            set(&[1])
        );
    }

    #[test]
    fn marks_every_node_that_may_be_first_across_branches() {
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), s.a ? Span('a', { color: 'red', 'data-i': 1 }) : null, Span('b', { color: 'blue', 'data-i': 2 }), Card()] })"
            ),
            set(&[1, 2])
        );
    }

    #[test]
    fn marks_a_list_item_that_may_follow_a_component_item() {
        assert_eq!(
            carriers(
                "export const P = (w, items) => Div({ width: w, children: [...items.map(i => Div({ padding: 2, 'data-i': 1, children: Card() }))] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn reads_a_conditional_spread_as_part_of_its_walk() {
        // The spread's span follows a named node always there, so it is no walk of its own.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Span('a', { color: 'red', 'data-i': 1 }), ...(s.e ? [Span('b', { color: 'blue', 'data-i': 2 })] : []), Div({ width: w })] })"
            ),
            set(&[])
        );
    }

    #[test]
    fn marks_the_root_of_a_walk_in_a_component_prop() {
        assert_eq!(
            carriers("export const P = (w) => Div({ width: w, children: [Card({ icon: Span('i', { color: 'red', 'data-i': 5 }) })] })"),
            set(&[5])
        );
    }

    #[test]
    fn marks_nothing_without_extraction() {
        assert_eq!(carriers_with("export const P = () => Div({ padding: 1, 'data-i': 0, children: [Card()] })", false), set(&[]));
    }
}
