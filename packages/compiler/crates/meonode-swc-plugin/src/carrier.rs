//! Carrier marks: `__meo$r: 1` on the named nodes that carry a run of named
//! styles.
//!
//! A walk is one outermost host factory call, read in pre-order: its named
//! nodes (`__meo$n` or `__meo$t`, no `__meo$c`), its runtime nodes (`__meo$c`),
//! the components among its children, and its start and end. A host that is a
//! runtime node only on some renders (a `css` read at run time, or a host call
//! left uncompiled) is no cut. Named nodes keep no element of their own for
//! their styles: a runtime node or a carrier inserts the run of them since the
//! last such rule, and the runtime makes a named node with no rule before it,
//! since the walk's start or a cut, a carrier, which renders through
//! `StyledRenderer`.
//!
//! The mark is a call site's, the same on every render, so a node never changes
//! its element type between renders. A named node is marked when, for some
//! combination of its conditions, it comes with no rule before it since the
//! walk's start or a component. A component here is any slot of a host, a
//! position the extraction marks as one that may render a component (`__meo$p`,
//! which this pass removes once read), or a child that may be one. A memoized
//! host (one given `deps`) is a component on both sides: the runtime cuts before
//! it, and the browser walks it on its own. Over a conditional, a spread and a
//! generated list every member is optional, but a host holding a node is there
//! whenever the node is; a `.map()` item is read twice so an item's nodes see
//! the item before it.
//!
//! A named node is also marked wherever another call site may take its position
//! on another render (see [`Shared`]), or below a node whose position is
//! shared, so a position never holds a carrier on one render and a plain host
//! on the next.

use std::collections::HashSet;

use swc_core::common::Spanned;
use swc_core::ecma::ast::*;
use swc_core::ecma::visit::{Visit, VisitMut, VisitMutWith, VisitWith};

use crate::extract::{ModuleScope, NAME_KEY, SLOTS_KEY, TEMPLATE_KEY};
use crate::factory_call::FactorySites;
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
    /// For a host, the index after its subtree's last token, so a token before
    /// that is inside it; `0` for any other token.
    end: usize,
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
        let PropOrSpread::Prop(prop) = p else {
            return None;
        };
        let Prop::KeyValue(kv) = &**prop else {
            return None;
        };
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
        call.args
            .iter()
            .filter_map(|a| match unwrap_transparent(&a.expr) {
                Expr::Object(obj) if a.spread.is_none() => Some(obj),
                _ => None,
            })
    };
    objects()
        .find(|o| has_key(o, MARKER_KEY))
        .or_else(|| objects().next())
}

/// Whether a host call has `deps`, the argument after its props, other than a
/// written `undefined`. The runtime renders such a node in a walk of its own in
/// the browser and inline on the server, and cuts a run before it in both. One
/// that may be `undefined` on some render is read as one: a component token
/// marks the same whether or not the cut is there on every render.
fn is_memo(call: &CallExpr) -> bool {
    let Some(props) = props_of(call) else {
        return false;
    };
    let Some(at) = call.args.iter().position(
        |a| matches!(unwrap_transparent(&a.expr), Expr::Object(o) if std::ptr::eq(o, props)),
    ) else {
        return false;
    };
    call.args
        .get(at + 1)
        .is_some_and(|deps| match unwrap_transparent(&deps.expr) {
            Expr::Ident(id) => id.sym.as_ref() != "undefined",
            Expr::Unary(u) => u.op != UnaryOp::Void,
            _ => true,
        })
}

/// A host call's children: its `children` prop, in the DOM bucket or not, or a
/// positional first argument that is not its props.
fn children_of(call: &CallExpr) -> Option<&Expr> {
    let props = props_of(call);
    if let Some(children) = props.and_then(|p| value_of(p, "children")) {
        return Some(children);
    }
    if let Some(Expr::Object(dom)) = props
        .and_then(|p| value_of(p, DOM_KEY))
        .map(unwrap_transparent)
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

/// A host's slots (`__meo$p`): each a path of indices into its children,
/// the empty path before a children value that is not an array.
/// A rewritten call of an imported factory, `__meoFactoryCall(X, site, ...args)`,
/// read as the node it builds: its props, its children and whether it is given
/// `deps`, by the factory's own argument order (`at`, the props' index).
struct FactoryCall<'c> {
    props: Option<&'c ObjectLit>,
    children: Option<&'c Expr>,
    memo: bool,
}

fn factory_call<'c>(call: &'c CallExpr, sites: &FactorySites) -> Option<FactoryCall<'c>> {
    let at = sites.site_of(call)?.at;
    let args = call.args.get(2..).unwrap_or_default();
    let props = args
        .get(at)
        .and_then(|arg| match unwrap_transparent(&arg.expr) {
            Expr::Object(obj) => Some(obj),
            _ => None,
        });
    let children = if at == 0 {
        props.and_then(|p| value_of(p, "children"))
    } else {
        args.first().map(|arg| &*arg.expr)
    };
    let memo = args
        .get(at + 1)
        .is_some_and(|deps| match unwrap_transparent(&deps.expr) {
            Expr::Ident(id) => id.sym.as_ref() != "undefined",
            Expr::Unary(u) => u.op != UnaryOp::Void,
            _ => true,
        });
    Some(FactoryCall {
        props,
        children,
        memo,
    })
}

fn slots_of(props: &ObjectLit) -> Vec<Vec<usize>> {
    let index = |e: &Expr| match e {
        Expr::Lit(Lit::Num(n)) => Some(n.value as usize),
        _ => None,
    };
    let Some(Expr::Array(paths)) = value_of(props, SLOTS_KEY) else {
        return Vec::new();
    };
    paths
        .elems
        .iter()
        .flatten()
        .filter_map(|p| match &*p.expr {
            Expr::Array(path) => path
                .elems
                .iter()
                .flatten()
                .map(|i| index(&i.expr))
                .collect(),
            e => index(e).map(|i| vec![i]),
        })
        .collect()
}

pub(crate) fn is_map(call: &CallExpr) -> bool {
    matches!(&call.callee, Callee::Expr(callee)
        if matches!(&**callee, Expr::Member(m) if matches!(&m.prop, MemberProp::Ident(p) if p.sym.as_ref() == "map")))
}

/// What a `.map()` callback returns: its expression body, or the arguments of
/// the return statements of its block, not of functions inside it.
pub(crate) fn map_returns(call: &CallExpr) -> Vec<&Expr> {
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
    /// The rewritten calls of imported factories.
    sites: &'a FactorySites,
    /// Whether such a call is read as the named node the runtime builds when it
    /// joins the call, or as a component, which it is when the callee is one.
    factory_calls_named: bool,
    /// Host calls already read as part of a walk.
    consumed: HashSet<Site>,
    carriers: HashSet<Site>,
}

impl Walks<'_> {
    fn is_host(&self, call: &CallExpr) -> bool {
        self.scope.extractable_factory(call).is_some()
    }

    fn emit(&mut self, expr: &Expr, optional: bool, out: &mut Vec<Token>) {
        let push = |out: &mut Vec<Token>, kind| {
            out.push(Token {
                kind,
                optional,
                site: None,
                end: 0,
            })
        };
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
            Expr::Array(array) => self.emit_array(array, optional, &[], &mut Vec::new(), out),
            Expr::Call(call) if is_map(call) => self.emit_list(call, out),
            // A call of an imported factory, read as the named node the runtime
            // builds when it joins the call (on the other reading it is a
            // component, below).
            Expr::Call(call) if self.factory_calls_named && self.sites.site_of(call).is_some() => {
                let Some(node) = factory_call(call, self.sites) else {
                    return;
                };
                let site = site_of(call);
                self.consumed.insert(site);
                if node.memo {
                    push(out, Kind::Component);
                }
                let at = out.len();
                out.push(Token {
                    kind: Kind::Named,
                    optional,
                    site: Some(site),
                    end: 0,
                });
                if let Some(children) = node.children {
                    match unwrap_transparent(children) {
                        Expr::Array(array) => {
                            self.emit_array(array, optional, &[], &mut Vec::new(), out)
                        }
                        child => self.emit(child, optional, out),
                    }
                }
                out[at].end = out.len();
                if node.memo {
                    push(out, Kind::Component);
                }
            }
            Expr::Call(call) if self.is_host(call) => {
                let site = site_of(call);
                self.consumed.insert(site);
                let kind = match props_of(call).filter(|props| has_key(props, MARKER_KEY)) {
                    // Styles the runtime always has: it renders through `StyledRenderer`.
                    Some(props) if has_key(props, CSS_KEY) => Kind::Runtime,
                    Some(props) if has_key(props, NAME_KEY) || has_key(props, TEMPLATE_KEY) => {
                        Kind::Named
                    }
                    // No styles, a `css` read at run time (the compiler moves
                    // static styles beside it to `__meo$c`), or a host call left
                    // uncompiled: a cut only on renders where it holds a style.
                    // A cut that may be absent marks as an absent one does.
                    _ => Kind::Plain,
                };
                // A memoized node is a cut before it, and its walk in the
                // browser ends after it; on the server the walk goes through.
                let memo = is_memo(call);
                if memo {
                    push(out, Kind::Component);
                }
                let at = out.len();
                out.push(Token {
                    kind,
                    optional,
                    site: Some(site),
                    end: 0,
                });
                if let Some(children) = children_of(call) {
                    let slots = props_of(call).map(slots_of).unwrap_or_default();
                    match unwrap_transparent(children) {
                        Expr::Array(array) => {
                            self.emit_array(array, optional, &slots, &mut Vec::new(), out)
                        }
                        child => {
                            if slots.iter().any(Vec::is_empty) {
                                out.push(Token {
                                    kind: Kind::Component,
                                    optional,
                                    site: None,
                                    end: 0,
                                });
                            }
                            self.emit(child, optional, out);
                        }
                    }
                }
                out[at].end = out.len();
                if memo {
                    push(out, Kind::Component);
                }
            }
            Expr::JSXElement(element) => {
                let host = matches!(&element.opening.name, JSXElementName::Ident(id) if id.sym.starts_with(|c: char| c.is_ascii_lowercase()));
                push(out, if host { Kind::Plain } else { Kind::Component });
            }
            _ => push(out, Kind::Component),
        }
    }

    /// An array of children at `path` among a host's: each slot of the host
    /// (`__meo$p`) before its position, then the child. The runtime's walk
    /// cuts at a slot as at a component, whatever renders there.
    fn emit_array(
        &mut self,
        array: &ArrayLit,
        optional: bool,
        slots: &[Vec<usize>],
        path: &mut Vec<usize>,
        out: &mut Vec<Token>,
    ) {
        for (index, elem) in array.elems.iter().enumerate() {
            let Some(elem) = elem else { continue };
            path.push(index);
            if slots.contains(path) {
                out.push(Token {
                    kind: Kind::Component,
                    optional,
                    site: None,
                    end: 0,
                });
            }
            if elem.spread.is_none() {
                match unwrap_transparent(&elem.expr) {
                    Expr::Array(inner) => self.emit_array(inner, optional, slots, path, out),
                    child => self.emit(child, optional, out),
                }
                path.pop();
                continue;
            }
            path.pop();
            // A spread of literals and branches over them is read through,
            // every member optional; any other is opaque.
            match unwrap_transparent(&elem.expr) {
                Expr::Call(call) if is_map(call) => self.emit_list(call, out),
                inner @ (Expr::Array(_) | Expr::Cond(_)) => self.emit(inner, true, out),
                inner @ Expr::Bin(b)
                    if matches!(
                        b.op,
                        BinaryOp::LogicalAnd | BinaryOp::LogicalOr | BinaryOp::NullishCoalescing
                    ) =>
                {
                    self.emit(inner, true, out)
                }
                _ => out.push(Token {
                    kind: Kind::Component,
                    optional: true,
                    site: None,
                    end: 0,
                }),
            }
        }
    }

    /// A generated list's items: the callback's results, twice, all optional.
    fn emit_list(&mut self, call: &CallExpr, out: &mut Vec<Token>) {
        let returns = map_returns(call);
        if returns.is_empty() {
            out.push(Token {
                kind: Kind::Component,
                optional: true,
                site: None,
                end: 0,
            });
            return;
        }
        for _ in 0..2 {
            for r in &returns {
                self.emit(r, true, out);
            }
        }
    }

    /// Marks each named node of the walk that may come with no rule before it
    /// since the walk's start or a cut, where the runtime makes it a carrier.
    fn choose(&mut self, tokens: &[Token]) {
        for (i, token) in tokens.iter().enumerate() {
            if token.kind != Kind::Named {
                continue;
            }
            let mut left = HashSet::new();
            for other in tokens[..i].iter().rev() {
                // A host holding the node is there whenever the node is.
                let always = !other.optional || other.end > i;
                match other.kind {
                    Kind::Plain => continue,
                    Kind::Named if !always => continue,
                    Kind::Named => break,
                    kind => {
                        left.insert(kind);
                        if always {
                            break;
                        }
                    }
                }
            }
            if (left.contains(&Kind::Start) || left.contains(&Kind::Component))
                && let Some(site) = token.site
            {
                self.carriers.insert(site);
            }
        }
    }
}

impl Visit for Walks<'_> {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        let root =
            self.is_host(call) || (self.factory_calls_named && self.sites.site_of(call).is_some());
        if root && !self.consumed.contains(&site_of(call)) {
            let mut tokens = vec![Token {
                kind: Kind::Start,
                optional: false,
                site: None,
                end: 0,
            }];
            self.emit(&Expr::Call(call.clone()), false, &mut tokens);
            tokens.push(Token {
                kind: Kind::End,
                optional: false,
                site: None,
                end: 0,
            });
            self.choose(&tokens);
        }
        call.visit_children_with(self);
    }
}

/// Reads the positions a named node may share with another call site across
/// renders, and adds the named nodes there to the carriers: a node marked at a
/// position some other node takes on another render would change its fiber's
/// type there, from `StyledRenderer` to a host or back, and remount, where the
/// runtime renders every styled node through `StyledRenderer` and keeps it. A
/// position is shared by both arms of a conditional, by the operands of `&&`,
/// `||` and `??`, by the items of a variable-length region of a children
/// array (a spread, a `.map()`, or a child that may be absent), and by every
/// sibling after one. Where both call sites render the same element type, React
/// keeps the fiber and matches their children by position, so every position
/// below a shared one is shared too. A keyed node is matched by its key, so it
/// and its subtree are left out.
struct Shared<'a> {
    scope: &'a ModuleScope,
    sites: &'a FactorySites,
    carriers: &'a mut HashSet<Site>,
}

impl Shared<'_> {
    /// Marks every named, unkeyed host call `expr` may render as at its position,
    /// and every one in their subtrees.
    fn share(&mut self, expr: &Expr) {
        match unwrap_transparent(expr) {
            Expr::Cond(c) => {
                self.share(&c.cons);
                self.share(&c.alt);
            }
            Expr::Bin(b) if b.op == BinaryOp::LogicalAnd => self.share(&b.right),
            Expr::Bin(b) if matches!(b.op, BinaryOp::LogicalOr | BinaryOp::NullishCoalescing) => {
                self.share(&b.left);
                self.share(&b.right);
            }
            Expr::Array(array) => {
                for elem in array.elems.iter().flatten() {
                    self.share(&elem.expr);
                }
            }
            Expr::Call(call) if is_map(call) => {
                for r in map_returns(call) {
                    self.share(r);
                }
            }
            Expr::Call(call) if self.sites.site_of(call).is_some() => {
                let Some(node) = factory_call(call, self.sites) else {
                    return;
                };
                if node.props.is_some_and(|p| has_key(p, "key")) {
                    return;
                }
                self.carriers.insert(site_of(call));
                if let Some(children) = node.children {
                    self.share(children);
                }
            }
            Expr::Call(call) if self.scope.extractable_factory(call).is_some() => {
                let props = props_of(call);
                // A keyed node is matched by its key, so no other call site's
                // fiber is kept for it, nor its children matched against another's.
                if props.is_some_and(|p| has_key(p, "key")) {
                    return;
                }
                if let Some(props) = props.filter(|p| has_key(p, MARKER_KEY))
                    && (has_key(props, NAME_KEY) || has_key(props, TEMPLATE_KEY))
                    && !has_key(props, CSS_KEY)
                {
                    self.carriers.insert(site_of(call));
                }
                // Where the other call site renders the same element type, React
                // keeps the fiber and matches the children by position.
                if let Some(children) = children_of(call) {
                    self.share(children);
                }
            }
            _ => {}
        }
    }

    /// A children array's positions in order, nested array literals read
    /// through: each item of a variable-length region and every child after
    /// one is shared.
    fn sequence(&mut self, array: &ArrayLit, shifted: &mut bool) {
        for elem in array.elems.iter().flatten() {
            let child = unwrap_transparent(&elem.expr);
            if elem.spread.is_none()
                && let Expr::Array(nested) = child
            {
                self.sequence(nested, shifted);
                continue;
            }
            let region = elem.spread.is_some()
                || matches!(child, Expr::Call(call) if is_map(call))
                || may_be_absent(child);
            if *shifted || region {
                self.share(child);
            }
            *shifted |= region;
        }
    }
}

/// Whether a child may render nothing, or several positions, on some render:
/// a logical operand, or a conditional with an arm that is absent or an array.
fn may_be_absent(child: &Expr) -> bool {
    match unwrap_transparent(child) {
        Expr::Bin(b) => matches!(
            b.op,
            BinaryOp::LogicalAnd | BinaryOp::LogicalOr | BinaryOp::NullishCoalescing
        ),
        Expr::Cond(c) => [&c.cons, &c.alt]
            .into_iter()
            .any(|arm| match unwrap_transparent(arm) {
                Expr::Lit(Lit::Null(_) | Lit::Bool(_)) | Expr::Array(_) => true,
                Expr::Ident(id) => id.sym.as_ref() == "undefined",
                Expr::Unary(u) => u.op == UnaryOp::Void,
                other => may_be_absent(other),
            }),
        _ => false,
    }
}

impl Visit for Shared<'_> {
    fn visit_cond_expr(&mut self, cond: &CondExpr) {
        self.share(&cond.cons);
        self.share(&cond.alt);
        cond.visit_children_with(self);
    }

    fn visit_bin_expr(&mut self, bin: &BinExpr) {
        if bin.op == BinaryOp::LogicalAnd {
            self.share(&bin.right);
        }
        bin.visit_children_with(self);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        // A host's children, or a `children` prop handed to whatever renders it.
        let children = if let Some(node) = factory_call(call, self.sites) {
            node.children
        } else if self.scope.extractable_factory(call).is_some() {
            children_of(call)
        } else {
            props_of(call).and_then(|props| value_of(props, "children"))
        };
        if let Some(Expr::Array(array)) = children.map(unwrap_transparent) {
            self.sequence(array, &mut false);
        }
        call.visit_children_with(self);
    }
}

/// Adds the mark to the carriers' compiled props, and takes the slots out of
/// every compiled call site's: they are this pass's input only. A call of an
/// imported factory carries its mark on its site instead: its props are the
/// ones it is made with if the runtime does not join it, which carry none.
struct Marker<'a> {
    carriers: &'a HashSet<Site>,
    sites: &'a FactorySites,
}

impl VisitMut for Marker<'_> {
    fn visit_mut_call_expr(&mut self, call: &mut CallExpr) {
        call.visit_mut_children_with(self);
        let carrier = self.carriers.contains(&site_of(call)) && self.sites.site_of(call).is_none();
        for arg in &mut call.args {
            let Expr::Object(obj) = &mut *arg.expr else {
                continue;
            };
            if !has_key(obj, MARKER_KEY) {
                continue;
            }
            obj.props.retain(|p| key_name(p) != Some(SLOTS_KEY));
            if !carrier || has_key(obj, CARRIER_KEY) {
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

/// Marks the carriers of every walk in `module`, then drops the slots it read.
pub fn mark(module: &mut Module, scope: &ModuleScope, sites: &mut FactorySites) {
    // A call of an imported factory is a named node or a component, which only
    // the runtime knows. A mark is never wrong, only one missing is, so the
    // marks are those of both readings.
    let mut carriers = HashSet::new();
    for factory_calls_named in [false, true] {
        let mut walks = Walks {
            scope,
            sites,
            factory_calls_named,
            consumed: HashSet::new(),
            carriers: HashSet::new(),
        };
        module.visit_with(&mut walks);
        carriers.extend(walks.carriers);
    }
    module.visit_with(&mut Shared {
        scope,
        sites,
        carriers: &mut carriers,
    });
    module.visit_mut_with(&mut Marker {
        carriers: &carriers,
        sites,
    });
    // A call of an imported factory carries its mark on its site, which the
    // runtime copies onto the node it builds.
    for (span, &index) in &sites.by_span {
        if carriers.contains(span) {
            sites.sites[index].carrier = true;
        }
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

    const IMPORTS: &str = "import { Activity, Div, Node, Row, Span, Suspense } from '@meonode/ui'\nimport { SuspenseList } from 'react'\nimport { Card } from './card'\n";

    /// The `data-i` of every call site the transform marks as a carrier, for
    /// `src` after the imports, with extraction on or off.
    fn carriers_with(src: &str, extract: bool) -> BTreeSet<i64> {
        let src = format!("{IMPORTS}{src}");
        GLOBALS.set(&Globals::new(), || {
            let cm: Lrc<SourceMap> = Default::default();
            let fm = cm.new_source_file(Lrc::new(FileName::Anon), src.clone());
            let lexer = Lexer::new(
                Syntax::Es(EsSyntax {
                    jsx: true,
                    ..Default::default()
                }),
                EsVersion::EsNext,
                StringInput::from(&*fm),
                None,
            );
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
        assert_eq!(
            carriers("export const P = () => Div({ padding: 1, 'data-i': 0, children: [Card()] })"),
            set(&[0])
        );
    }

    #[test]
    fn marks_a_named_root_whatever_follows_it() {
        // No rule is before the root, so the runtime carries its run there even
        // with a runtime node after it: the mark makes that the same on every render.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ padding: 1, 'data-i': 0, children: [Div({ width: w, 'data-i': 1 }), Card()] })"
            ),
            set(&[0])
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
    fn marks_a_named_node_after_a_component_whatever_follows_it() {
        // The component cuts the run, so no rule is before the node.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Card(), Span('a', { color: 'red', 'data-i': 1 }), Div({ width: w })] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn leaves_a_stretch_after_a_runtime_node_unmarked() {
        // The runtime node before it takes the run, after its own rule.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Card(), Div({ width: w }), Span('a', { color: 'red', 'data-i': 1 }), Card()] })"
            ),
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
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Div({ css: s.css }), Span('a', { color: 'red', 'data-i': 1 }), Card()] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn marks_a_stretch_ending_at_a_spread_slot() {
        // The spread's slot is a cut on every render that has a child there,
        // whatever its items are.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Div({ padding: 1, 'data-i': 1, children: [...s.items.map(item => Div({ width: w })), Div({ width: w })] })] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn marks_a_stretch_ending_at_the_slot_before_a_single_child() {
        // The walk does not enter an element with a read inside, which may
        // render a component: its slot is the empty path.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Div({ padding: 1, 'data-i': 1, children: <div>{w}</div> }), Div({ width: w })] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn marks_a_memoized_node_after_a_named_sibling() {
        // A host with `deps` is a cut before it, and the browser renders it in a
        // walk of its own, which ends after it.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Span('a', { color: 'red', 'data-i': 1 }), Span('b', { color: 'blue', 'data-i': 2 }, []), Div({ width: w })] })"
            ),
            set(&[2])
        );
    }

    #[test]
    fn marks_a_named_node_after_a_memoized_one() {
        // The memoized node's walk ends before it in the browser, so it begins a
        // stretch that ends at the component.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Span('b', { color: 'blue', 'data-i': 2 }, []), Span('c', { color: 'green', 'data-i': 3 }), Card()] })"
            ),
            set(&[2, 3])
        );
    }

    #[test]
    fn marks_a_memoized_parent_that_begins_its_own_walk() {
        // The memoized parent's walk is its own in the browser, and it begins it.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Card(), Row({ gap: 1, 'data-i': 0, children: [Span('a', { color: 'red', 'data-i': 1 })] }, [w]), Div({ width: w })] })"
            ),
            set(&[0])
        );
    }

    #[test]
    fn reads_deps_that_may_be_undefined_as_a_cut() {
        // A cut where `d` is `undefined` marks no more than one where it is not.
        assert_eq!(
            carriers(
                "export const P = (w, d) => Div({ width: w, children: [Span('a', { color: 'red', 'data-i': 1 }), Span('b', { color: 'blue', 'data-i': 2 }, d), Div({ width: w })] })"
            ),
            set(&[2])
        );
    }

    #[test]
    fn reads_written_undefined_deps_as_no_cut() {
        // The node renders inline, so the runtime node after it takes the run.
        for deps in ["undefined", "void 0"] {
            assert_eq!(
                carriers(&format!(
                    "export const P = (w) => Div({{ width: w, children: [Span('a', {{ color: 'red', 'data-i': 1 }}), Span('b', {{ color: 'blue', 'data-i': 2 }}, {deps}), Div({{ width: w }})] }})"
                )),
                set(&[]),
                "{deps}"
            );
        }
    }

    #[test]
    fn marks_a_named_run_before_suspense_activity_and_suspense_list() {
        for boundary in [
            "Suspense({ fallback: null, children: Card() })",
            "Activity({ mode: 'hidden', children: Card() })",
            "Node(SuspenseList, { children: Card() })",
        ] {
            assert_eq!(
                carriers(&format!(
                    "export const P = (w) => Div({{ width: w, children: [Card(), Span('a', {{ color: 'red', 'data-i': 1 }}), {boundary}, Div({{ width: w }})] }})"
                )),
                set(&[1]),
                "{boundary}"
            );
        }
    }

    #[test]
    fn marks_both_arms_of_a_ternary() {
        // Either arm may hold the position on a render: a carrier and a plain
        // host there would change the fiber's type between renders.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [s.a ? Span('a', { color: 'red', 'data-i': 1 }) : Span('b', { color: 'blue', 'data-i': 2 }), Div({ width: w })] })"
            ),
            set(&[1, 2])
        );
    }

    #[test]
    fn marks_a_logical_operand_and_the_siblings_after_it() {
        // The `&&` child may be absent, so the siblings after it move.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Span('z', { color: 'gray', 'data-i': 0 }), Div({ width: w }), s.a && Span('a', { color: 'red', 'data-i': 1 }), Span('b', { color: 'blue', 'data-i': 2 }), Div({ width: w })] })"
            ),
            set(&[1, 2])
        );
    }

    #[test]
    fn marks_unkeyed_list_items_and_the_siblings_after_them() {
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [...s.items.map(item => Span('a', { color: 'red', 'data-i': 1 })), Span('b', { color: 'blue', 'data-i': 2 }), Div({ width: w })] })"
            ),
            set(&[1, 2])
        );
    }

    #[test]
    fn marks_both_operands_of_or_and_nullish() {
        for op in ["||", "??"] {
            assert_eq!(
                carriers(&format!(
                    "export const P = (w, s) => Div({{ width: w, children: [s.x {op} Span('a', {{ color: 'red', 'data-i': 1 }}), Div({{ width: w }})] }})"
                )),
                set(&[1]),
                "{op}"
            );
        }
    }

    #[test]
    fn leaves_a_runtime_node_at_a_shared_position_unmarked() {
        // It renders through `StyledRenderer` on every render already.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [s.a ? Div({ width: w, 'data-i': 1 }) : Span('b', { color: 'blue', 'data-i': 2 }), Div({ width: w })] })"
            ),
            set(&[2])
        );
    }

    #[test]
    fn reads_nested_children_arrays_as_one_sequence() {
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [[s.a && Div({ width: w })], [Span('b', { color: 'blue', 'data-i': 2 })], Div({ width: w })] })"
            ),
            set(&[2])
        );
    }

    #[test]
    fn marks_a_logical_operand_that_is_a_sole_child() {
        for op in ["&&", "||"] {
            assert_eq!(
                carriers(&format!(
                    "export const P = (w, s) => Div({{ width: w, children: s.a {op} Span('a', {{ color: 'red', 'data-i': 1 }}) }})"
                )),
                set(&[1]),
                "{op}"
            );
        }
    }

    #[test]
    fn leaves_a_named_child_of_a_list_item_unmarked() {
        // The item's own node is always there when its child is, and is a rule
        // node before it: only the item, which follows the component of the item
        // before it, needs the mark.
        assert_eq!(
            carriers(
                "export const P = (s) => Div({ display: 'grid', 'data-i': 0, children: [Span('h', { key: 'h', fontSize: 1, 'data-i': 1 }), ...s.cards.map((c, i) => Div({ key: i, padding: 1, 'data-i': 2, children: [Span('b', { order: 1, 'data-i': 3 }), Card({ key: 'l' })] }))] })"
            ),
            set(&[0, 2])
        );
    }

    #[test]
    fn marks_named_nodes_under_a_shared_position() {
        // The two arms render the same element type, so React keeps the fiber
        // and matches their children by position: those are shared too.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [s.b ? Div({ width: w, children: [Span('a', { color: 'red', 'data-i': 1 })] }) : Div({ width: w, children: [Div({ 'data-i': 2 })] }), Div({ width: w })] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn leaves_the_subtree_of_a_keyed_shared_node_unmarked() {
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [s.b ? Div({ key: 'x', width: w, children: [Span('a', { color: 'red', 'data-i': 1 })] }) : null, Div({ width: w })] })"
            ),
            set(&[])
        );
    }

    #[test]
    fn leaves_keyed_positions_unmarked() {
        // React matches a keyed child by its key, not its position.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [...s.items.map(item => Span('a', { key: item, color: 'red', 'data-i': 1 })), Span('b', { key: 'b', color: 'blue', 'data-i': 2 }), s.a ? Span('c', { key: 'c', color: 'green', 'data-i': 3 }) : null, Div({ width: w })] })"
            ),
            set(&[])
        );
    }

    #[test]
    fn leaves_a_sibling_before_a_variable_region_unmarked() {
        // Its position is the same on every render.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Span('b', { color: 'blue', 'data-i': 2 }), s.a && Div({ width: w }), Div({ width: w })] })"
            ),
            set(&[])
        );
    }

    #[test]
    fn marks_the_items_of_a_conditional_spread() {
        // `[A]` and `[C]` share the first position of the region.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [...(s.a ? [Span('a', { color: 'red', 'data-i': 1 })] : [Span('c', { color: 'green', 'data-i': 3 })]), Div({ width: w })] })"
            ),
            set(&[1, 3])
        );
    }

    #[test]
    fn looks_past_an_uncompiled_host_to_the_component_before_it() {
        // Its props may hold no style, and the stretch begins after the component.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Div(s.props), Span('a', { color: 'red', 'data-i': 1 }), Card()] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn leaves_static_styles_beside_a_css_read_at_run_time_to_the_runtime() {
        // They go in `__meo$c` with the `css`, so the node is a runtime node.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Div({ padding: 1, css: s.css, 'data-i': 1 }), Card()] })"
            ),
            set(&[])
        );
    }

    #[test]
    fn marks_a_stretch_ending_at_the_walk_end() {
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Card(), Span('a', { color: 'red', 'data-i': 1 })] })"
            ),
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
    fn marks_a_list_item_whose_stretch_may_end_in_the_next_item() {
        // The next item's host cuts at its slot before the component, before
        // the runtime node after the list.
        assert_eq!(
            carriers(
                "export const P = (w, items) => Div({ width: w, children: [...items.map(i => Div({ children: [Card(), Div({ padding: 1, 'data-i': 1 })] })), Div({ width: w })] })"
            ),
            set(&[1])
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
        // The spread follows a named node always there, which carries what comes
        // after it. Its item is keyed, so its shared position needs no mark either.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Span('a', { color: 'red', 'data-i': 1 }), ...(s.e ? [Span('b', { key: 'b', color: 'blue', 'data-i': 2 })] : []), Div({ width: w })] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn marks_the_root_of_a_walk_in_a_component_prop() {
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Card({ icon: Span('i', { color: 'red', 'data-i': 5 }) })] })"
            ),
            set(&[5])
        );
    }

    #[test]
    fn marks_nothing_without_extraction() {
        assert_eq!(
            carriers_with(
                "export const P = () => Div({ padding: 1, 'data-i': 0, children: [Card()] })",
                false
            ),
            set(&[])
        );
    }
}
