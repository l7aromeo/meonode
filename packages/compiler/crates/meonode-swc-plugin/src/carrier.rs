//! Carrier marks: `__meo$r: 1` on the named nodes that carry a run of named
//! styles on every render.
//!
//! The runtime renders a named node (`__meo$n` or `__meo$t`, no `__meo$c`) as a
//! carrier, through `StyledRenderer`, when no rule comes before it since its
//! walk's start or the last cut: no runtime node (`__meo$c`) and no other named
//! node, since a named node renders plain only after a rule. Anywhere else it
//! renders its host element and its style goes in with the rule before it. A
//! node whose answer is the same on every render keeps its element type with no
//! mark. The mark is for a node whose answer may change between renders, which
//! would change its fiber's type and remount it: it then renders as a carrier
//! on every render.
//!
//! A walk is read in pre-order, as tokens: its entry, its named and runtime
//! nodes, hosts that may hold a style only on some renders (a `css` read at run
//! time, a host call left uncompiled), plain hosts, cuts and the end. A cut is a
//! component, a memoized host and a boundary. A child the compiler cannot read may be a cut,
//! a rule or nothing. Over a conditional, a spread and a generated list every
//! member is optional, but a host holding a node is there whenever the node is;
//! a generated item is read twice so an item's nodes see the item before it. A
//! node is marked when some render puts a cut or the walk's start before it with
//! no rule after, and another puts a rule there.
//!
//! A walk's entry is what comes before its outermost call. A tree that is
//! `.render()`ed, that a `Component` function returns, or that is the child of
//! one of `@meonode/ui`'s pass-through providers begins its walk. A tree a
//! helper returns joins its caller's walk where the call is: when every use of
//! the helper is a direct call in the module, its entry is what comes before
//! each call, joined over them to a fixpoint, and each call reads as what the
//! helper's returns may leave after them. Any other tree, such as one exported,
//! assigned or passed as an argument, may come with or without a rule before it.
//!
//! A named node is also marked wherever another call site may take its position
//! on another render (see [`Shared`]), or below a node whose position is
//! shared, so a position never holds a carrier on one render and a plain host
//! on the next.

use std::collections::{HashMap, HashSet};

use swc_core::common::{Spanned, SyntaxContext};
use swc_core::ecma::ast::*;
use swc_core::ecma::atoms::Atom;
use swc_core::ecma::visit::{Visit, VisitMut, VisitMutWith, VisitWith};

use crate::extract::{ModuleScope, NAME_KEY, TEMPLATE_KEY};
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
    /// What comes before the walk's outermost call (see [`Entry`]).
    Entry,
    End,
    /// A named node: its styles are a call site's, inserted by whatever carries them.
    Named,
    /// A node rendering through `StyledRenderer`, which inserts styles itself.
    Runtime,
    /// A host that holds a style on some renders: a `css` read at run time, or a
    /// host call left uncompiled.
    MaybeRule,
    /// A host with no styles.
    Plain,
    /// A cut on every render it is there: a component, a memoized host or a
    /// boundary.
    Component,
    /// A child the compiler cannot read: a cut, a rule or nothing.
    Any,
    /// A call of the helper at this index (see [`Functions`]).
    Call(usize),
}

/// What comes before a walk's outermost call.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Entry {
    /// The walk begins there on every render.
    Start,
    /// It may begin there or come after a rule.
    Varies,
    /// The helper at this index returns it: what comes before its calls.
    Helper(usize),
}

/// Whether a host call is memoized: given `deps` on every render, on some, or not.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Memo {
    Never,
    Maybe,
    Always,
}

/// What may come before a position since the last cut: a cut or the walk's
/// start with no rule after it (`first`), a rule (`rule`), or nothing of the
/// walk, so whatever its entry is (`entry`).
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
struct Reach {
    first: bool,
    rule: bool,
    entry: bool,
}

/// A binding, by its symbol and its syntax context.
type BindKey = (Atom, SyntaxContext);

fn bind_key(id: &Ident) -> BindKey {
    (id.sym.clone(), id.ctxt)
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

/// Whether a host call has `deps`, the argument after its props. The runtime
/// renders such a node in a walk of its own in the browser and inline on the
/// server, and cuts a run before it in both. A written `undefined` is none; an
/// array literal is there on every render; any other value may be `undefined`
/// on some render.
fn memo_of(call: &CallExpr) -> Memo {
    let Some(props) = props_of(call) else {
        return Memo::Never;
    };
    let Some(at) = call.args.iter().position(
        |a| matches!(unwrap_transparent(&a.expr), Expr::Object(o) if std::ptr::eq(o, props)),
    ) else {
        return Memo::Never;
    };
    deps_memo(call.args.get(at + 1))
}

/// What a `deps` argument makes of its node (see [`memo_of`]).
fn deps_memo(deps: Option<&ExprOrSpread>) -> Memo {
    let Some(deps) = deps else {
        return Memo::Never;
    };
    match unwrap_transparent(&deps.expr) {
        Expr::Ident(id) if id.sym.as_ref() == "undefined" => Memo::Never,
        Expr::Unary(u) if u.op == UnaryOp::Void => Memo::Never,
        Expr::Array(_) => Memo::Always,
        _ => Memo::Maybe,
    }
}

/// Whether a host's `as` may render a component in its place, a cut there: any
/// value but a tag string, which renders a host, and any spread but one of the
/// module's `const` objects known to hold no `as` (see [`Functions::objects`]).
fn swaps_to_component(props: &ObjectLit, objects: &HashSet<BindKey>) -> bool {
    value_of(props, "as").is_some_and(|value| !matches!(unwrap_transparent(value), Expr::Lit(Lit::Str(_))))
        || props.props.iter().any(|p| match p {
            PropOrSpread::Spread(spread) => {
                !matches!(unwrap_transparent(&spread.expr), Expr::Ident(id) if objects.contains(&bind_key(id)))
            }
            PropOrSpread::Prop(_) => false,
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

/// A rewritten call of an imported factory, `__meoFactoryCall(X, site, ...args)`,
/// read as the node it builds: its props, its children and whether it is given
/// `deps`, by the factory's own argument order (`at`, the props' index).
struct FactoryCall<'c> {
    props: Option<&'c ObjectLit>,
    children: Option<&'c Expr>,
    memo: Memo,
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
    let memo = deps_memo(args.get(at + 1));
    Some(FactoryCall {
        props,
        children,
        memo,
    })
}

pub(crate) fn is_map(call: &CallExpr) -> bool {
    matches!(&call.callee, Callee::Expr(callee)
        if matches!(&**callee, Expr::Member(m) if matches!(&m.prop, MemberProp::Ident(p) if p.sym.as_ref() == "map")))
}

/// Whether `call` is `Array.from(source, callback)`.
fn is_array_from(call: &CallExpr) -> bool {
    call.args.len() >= 2
        && matches!(&call.callee, Callee::Expr(callee)
            if matches!(&**callee, Expr::Member(m)
                if matches!(&*m.obj, Expr::Ident(obj) if obj.sym.as_ref() == "Array")
                    && matches!(&m.prop, MemberProp::Ident(p) if p.sym.as_ref() == "from")))
}

/// What a generated list's callback returns per item: `.map(callback)`'s, or
/// `Array.from(source, callback)`'s.
fn list_returns(call: &CallExpr) -> Vec<&Expr> {
    if is_array_from(call) {
        call.args
            .get(1)
            .map(|callback| function_returns(&callback.expr))
            .unwrap_or_default()
    } else {
        map_returns(call)
    }
}

/// What a `.map()` callback returns: its expression body, or the arguments of
/// the return statements of its block, not of functions inside it.
pub(crate) fn map_returns(call: &CallExpr) -> Vec<&Expr> {
    call.args
        .first()
        .map(|callback| function_returns(&callback.expr))
        .unwrap_or_default()
}

/// What a function expression returns: its expression body, or the arguments
/// of the return statements of its block, not of functions inside it.
fn function_returns(function: &Expr) -> Vec<&Expr> {
    match unwrap_transparent(function) {
        Expr::Arrow(arrow) => arrow_returns(arrow),
        Expr::Fn(f) => f
            .function
            .body
            .as_ref()
            .map(|body| block_returns(&body.stmts))
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn arrow_returns(arrow: &ArrowExpr) -> Vec<&Expr> {
    match &*arrow.body {
        ArrowFunctionBody::Expr(e) => vec![&**e],
        ArrowFunctionBody::FunctionBody(b) => block_returns(&b.stmts),
    }
}

/// The arguments of a block's return statements, not of functions inside it;
/// a bare `return` is none.
fn block_returns(stmts: &[Stmt]) -> Vec<&Expr> {
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
    let mut returns = Returns(Vec::new());
    returns.stmts(stmts);
    returns.0
}

/// A function whose every use in the module is a direct call: its trees join
/// the caller's walk where each call is.
struct Helper {
    /// What it returns.
    returns: Vec<Expr>,
    /// Its calls.
    calls: Vec<Site>,
}

/// What the module's functions are to its walks.
#[derive(Default)]
struct Functions {
    /// The module's own function bindings: a `Node` of one renders a component.
    local: HashSet<BindKey>,
    helpers: Vec<Helper>,
    helper_of: HashMap<BindKey, usize>,
    /// Outermost calls whose walk begins where they are, on every render.
    starts: HashSet<Site>,
    /// `const` object literals of plain keys, none of them `as`, used only as
    /// spreads: a spread of one adds no `as` to a host.
    objects: HashSet<BindKey>,
}

impl Functions {
    fn collect(module: &Module, scope: &ModuleScope, sites: &FactorySites) -> Self {
        let mut uses = Uses {
            scope,
            sites,
            defs: HashMap::new(),
            direct: HashMap::new(),
            component: HashSet::new(),
            other: HashSet::new(),
            starts: HashSet::new(),
            objects: HashSet::new(),
        };
        module.visit_with(&mut uses);
        let Uses {
            defs,
            direct,
            component,
            other,
            mut starts,
            objects,
            ..
        } = uses;
        let mut functions = Functions {
            local: defs.keys().cloned().collect(),
            objects: objects
                .into_iter()
                .filter(|key| !other.contains(key))
                .collect(),
            ..Functions::default()
        };
        for (key, returns) in defs {
            if other.contains(&key) {
                continue;
            }
            let calls = direct.get(&key).cloned().unwrap_or_default();
            if component.contains(&key) {
                // Used only as `Component(f)`: what it returns begins a walk.
                if calls.is_empty() {
                    for r in &returns {
                        start_roots(r, scope, sites, &mut starts);
                    }
                }
                continue;
            }
            if calls.is_empty() {
                continue;
            }
            functions.helper_of.insert(key, functions.helpers.len());
            functions.helpers.push(Helper { returns, calls });
        }
        functions.starts = starts;
        functions
    }
}

/// Adds the outermost calls of `expr`, a tree that begins a walk, to `starts`:
/// a host call, the child of a pass-through provider, either arm of a
/// conditional.
fn start_roots(expr: &Expr, scope: &ModuleScope, sites: &FactorySites, starts: &mut HashSet<Site>) {
    match unwrap_transparent(expr) {
        Expr::Cond(c) => {
            start_roots(&c.cons, scope, sites, starts);
            start_roots(&c.alt, scope, sites, starts);
        }
        Expr::Call(call) if scope.is_pass_through_provider(call) => {
            if let Some(child) = props_of(call).and_then(|p| value_of(p, "children")) {
                start_roots(child, scope, sites, starts);
            }
        }
        Expr::Call(call)
            if scope.extractable_factory(call).is_some() || sites.site_of(call).is_some() =>
        {
            starts.insert(site_of(call));
        }
        _ => {}
    }
}

/// Reads every function binding of the module and every use of one.
struct Uses<'a> {
    scope: &'a ModuleScope,
    sites: &'a FactorySites,
    /// Function declarations and `const` bindings of function expressions, with
    /// what each returns.
    defs: HashMap<BindKey, Vec<Expr>>,
    /// Each binding's direct calls.
    direct: HashMap<BindKey, Vec<Site>>,
    /// Bindings given to `Component`.
    component: HashSet<BindKey>,
    /// Bindings used any other way: read as a value, exported, rendered as JSX.
    other: HashSet<BindKey>,
    starts: HashSet<Site>,
    /// `const` object literals of plain keys, none of them `as`.
    objects: HashSet<BindKey>,
}

impl Visit for Uses<'_> {
    fn visit_fn_decl(&mut self, decl: &FnDecl) {
        if let Some(body) = &decl.function.body {
            let returns = block_returns(&body.stmts).into_iter().cloned().collect();
            self.defs.insert(bind_key(&decl.ident), returns);
        }
        decl.visit_children_with(self);
    }

    fn visit_var_decl(&mut self, var: &VarDecl) {
        if var.kind == VarDeclKind::Const {
            for decl in &var.decls {
                if let Pat::Ident(binding) = &decl.name
                    && let Some(init) = &decl.init
                    && let Expr::Object(object) = unwrap_transparent(init)
                    && object
                        .props
                        .iter()
                        .all(|p| matches!(key_name(p), Some(k) if k != "as"))
                {
                    self.objects.insert(bind_key(&binding.id));
                }
                if let Pat::Ident(binding) = &decl.name
                    && let Some(init) = &decl.init
                    && matches!(unwrap_transparent(init), Expr::Arrow(_) | Expr::Fn(_))
                {
                    let returns = function_returns(init).into_iter().cloned().collect();
                    self.defs.insert(bind_key(&binding.id), returns);
                }
            }
        }
        var.visit_children_with(self);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Callee::Expr(callee) = &call.callee
            && let Expr::Ident(id) = &**callee
        {
            self.direct
                .entry(bind_key(id))
                .or_default()
                .push(site_of(call));
            if self.scope.is_component_hoc(id) {
                for arg in &call.args {
                    match unwrap_transparent(&arg.expr) {
                        Expr::Ident(f) => {
                            self.component.insert(bind_key(f));
                        }
                        function @ (Expr::Arrow(_) | Expr::Fn(_)) => {
                            for r in function_returns(function) {
                                start_roots(r, self.scope, self.sites, &mut self.starts);
                            }
                            arg.visit_with(self);
                        }
                        _ => arg.visit_with(self),
                    }
                }
                return;
            }
            call.args.visit_with(self);
            return;
        }
        // `.render()` begins a walk at the tree it is called on.
        if let Callee::Expr(callee) = &call.callee
            && let Expr::Member(member) = &**callee
            && matches!(&member.prop, MemberProp::Ident(p) if p.sym.as_ref() == "render")
        {
            start_roots(&member.obj, self.scope, self.sites, &mut self.starts);
        }
        call.visit_children_with(self);
    }

    fn visit_expr(&mut self, expr: &Expr) {
        if let Expr::Ident(id) = expr {
            self.other.insert(bind_key(id));
        }
        expr.visit_children_with(self);
    }

    /// A spread of a bare binding reads it without handing it on.
    fn visit_spread_element(&mut self, spread: &SpreadElement) {
        if !matches!(unwrap_transparent(&spread.expr), Expr::Ident(_)) {
            spread.visit_children_with(self);
        }
    }

    fn visit_prop(&mut self, prop: &Prop) {
        if let Prop::Shorthand(id) = prop {
            self.other.insert(bind_key(id));
        }
        prop.visit_children_with(self);
    }

    fn visit_jsx_element_name(&mut self, name: &JSXElementName) {
        if let JSXElementName::Ident(id) = name {
            self.other.insert(bind_key(id));
        }
        name.visit_children_with(self);
    }

    fn visit_export_decl(&mut self, export: &ExportDecl) {
        match &export.decl {
            Decl::Fn(f) => {
                self.other.insert(bind_key(&f.ident));
            }
            Decl::Var(var) => {
                for decl in &var.decls {
                    if let Pat::Ident(binding) = &decl.name {
                        self.other.insert(bind_key(&binding.id));
                    }
                }
            }
            _ => {}
        }
        export.visit_children_with(self);
    }

    fn visit_export_named_specifier(&mut self, spec: &ExportNamedSpecifier) {
        if let ModuleExportName::Ident(id) = &spec.orig {
            self.other.insert(bind_key(id));
        }
    }

    fn visit_export_default_decl(&mut self, export: &ExportDefaultDecl) {
        if let DefaultDecl::Fn(f) = &export.decl
            && let Some(id) = &f.ident
        {
            self.other.insert(bind_key(id));
        }
        export.visit_children_with(self);
    }
}

/// What a walk is: its tokens, its entry, and the helper it is a return of.
struct Walk {
    entry: Entry,
    helper: Option<usize>,
    tokens: Vec<Token>,
}

/// Reads walks and collects the carriers' call sites.
struct Walks<'a> {
    scope: &'a ModuleScope,
    /// The rewritten calls of imported factories.
    sites: &'a FactorySites,
    functions: &'a Functions,
    /// Whether such a call is read as the named node the runtime builds when it
    /// joins the call, or as a component, which it is when the callee is one.
    factory_calls_named: bool,
    /// Host calls already read as part of a walk.
    consumed: HashSet<Site>,
    /// Helper calls read as part of a walk.
    called: HashSet<Site>,
    walks: Vec<Walk>,
}

impl Walks<'_> {
    fn is_host(&self, call: &CallExpr) -> bool {
        self.scope.extractable_factory(call).is_some()
    }

    /// The helper `call` calls, when it calls one.
    fn helper_called(&self, call: &CallExpr) -> Option<usize> {
        let Callee::Expr(callee) = &call.callee else {
            return None;
        };
        let Expr::Ident(id) = &**callee else {
            return None;
        };
        self.functions.helper_of.get(&bind_key(id)).copied()
    }

    /// Whether `call` is a `Node` of one of the module's own functions, which
    /// renders a component on every render.
    fn renders_local_component(&self, call: &CallExpr) -> bool {
        self.scope
            .node_element(call)
            .is_some_and(|element| matches!(unwrap_transparent(element), Expr::Ident(id) if self.functions.local.contains(&bind_key(id))))
    }

    fn emit(&mut self, expr: &Expr, optional: bool, out: &mut Vec<Token>) {
        let push = |out: &mut Vec<Token>, kind, optional| {
            out.push(Token {
                kind,
                optional,
                site: None,
                end: 0,
            })
        };
        // A memoized node: a cut before it on both sides, and after it the
        // browser's walk ends while the server's goes through.
        let memo_before = |out: &mut Vec<Token>, memo: Memo| {
            if memo != Memo::Never {
                push(out, Kind::Component, optional || memo == Memo::Maybe);
            }
        };
        let memo_after = |out: &mut Vec<Token>, memo: Memo| {
            if memo != Memo::Never {
                push(out, Kind::Any, true);
            }
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
            Expr::Array(array) => self.emit_array(array, optional, out),
            Expr::Call(call) if is_map(call) || is_array_from(call) => self.emit_list(call, out),
            Expr::Call(call) if let Some(helper) = self.helper_called(call) => {
                self.called.insert(site_of(call));
                push(out, Kind::Call(helper), optional);
            }
            // A call of an imported factory, read as the named node the runtime
            // builds when it joins the call, or, when it does not, as the call of
            // a function, which may return anything.
            Expr::Call(call) if self.sites.site_of(call).is_some() => {
                if !self.factory_calls_named {
                    push(out, Kind::Any, optional);
                    return;
                }
                let Some(node) = factory_call(call, self.sites) else {
                    return;
                };
                let site = site_of(call);
                self.consumed.insert(site);
                memo_before(out, node.memo);
                let at = out.len();
                out.push(Token {
                    kind: Kind::Named,
                    optional,
                    site: Some(site),
                    end: 0,
                });
                if let Some(children) = node.children {
                    self.emit(children, optional, out);
                }
                out[at].end = out.len();
                // Whether the runtime joins the call is the same on every render,
                // but a call it does not join is a function's, which may return a
                // component's element on one render and a node on the next: the
                // walk after it may be cut or follow a rule. This also covers a
                // memoized call's end.
                push(out, Kind::Any, optional);
            }
            Expr::Call(call) if self.is_host(call) => {
                let site = site_of(call);
                self.consumed.insert(site);
                let props = props_of(call);
                let swapped = props.is_some_and(|p| swaps_to_component(p, &self.functions.objects));
                let kind = match props.filter(|props| has_key(props, MARKER_KEY)) {
                    // `disableEmotion` read at run time may leave the node unstyled.
                    Some(props) if has_key(props, "disableEmotion") => Kind::MaybeRule,
                    // Styles the runtime always has: it renders through `StyledRenderer`.
                    Some(props) if has_key(props, CSS_KEY) => Kind::Runtime,
                    Some(props) if has_key(props, NAME_KEY) || has_key(props, TEMPLATE_KEY) => {
                        Kind::Named
                    }
                    // A `css` read at run time (the compiler moves static styles
                    // beside it to `__meo$c`), or a spread: a style on some renders.
                    Some(props)
                        if has_key(props, "css")
                            || props
                                .props
                                .iter()
                                .any(|p| matches!(p, PropOrSpread::Spread(_))) =>
                    {
                        Kind::MaybeRule
                    }
                    Some(_) => Kind::Plain,
                    // A host call left uncompiled.
                    None => Kind::MaybeRule,
                };
                let memo = memo_of(call);
                memo_before(out, memo);
                if swapped {
                    push(out, Kind::Any, optional);
                }
                let at = out.len();
                out.push(Token {
                    kind,
                    optional,
                    site: Some(site),
                    end: 0,
                });
                if let Some(children) = children_of(call) {
                    self.emit(children, optional, out);
                }
                out[at].end = out.len();
                if swapped {
                    push(out, Kind::Any, optional);
                }
                memo_after(out, memo);
            }
            Expr::Call(call) if self.renders_local_component(call) => {
                push(out, Kind::Component, optional)
            }
            // A host element with text children only renders no component; one
            // with any other child may, and any other element type may be a
            // component or not (a fragment).
            Expr::JSXElement(element) => {
                let host = matches!(&element.opening.name, JSXElementName::Ident(id) if id.sym.starts_with(|c: char| c.is_ascii_lowercase()));
                let text_only = element.children.iter().all(|child| match child {
                    JSXElementChild::JSXText(_) => true,
                    JSXElementChild::JSXExprContainer(container) => match &container.expr {
                        JSXExpr::JSXEmptyExpr(_) => true,
                        JSXExpr::Expr(e) => {
                            matches!(unwrap_transparent(e), Expr::Lit(_) | Expr::Tpl(_))
                        }
                    },
                    _ => false,
                });
                push(
                    out,
                    if host && text_only {
                        Kind::Plain
                    } else {
                        Kind::Any
                    },
                    optional,
                );
            }
            _ => push(out, Kind::Any, optional),
        }
    }

    /// An array of children, in order: nested arrays render as one sequence.
    fn emit_array(&mut self, array: &ArrayLit, optional: bool, out: &mut Vec<Token>) {
        for elem in array.elems.iter().flatten() {
            if elem.spread.is_none() {
                self.emit(&elem.expr, optional, out);
                continue;
            }
            // A spread of literals and branches over them is read through,
            // every member optional; any other is opaque.
            match unwrap_transparent(&elem.expr) {
                Expr::Call(call) if is_map(call) || is_array_from(call) => {
                    self.emit_list(call, out)
                }
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
                    kind: Kind::Any,
                    optional: true,
                    site: None,
                    end: 0,
                }),
            }
        }
    }

    /// A generated list's items: the callback's results, twice, all optional.
    fn emit_list(&mut self, call: &CallExpr, out: &mut Vec<Token>) {
        let returns = list_returns(call);
        if returns.is_empty() {
            out.push(Token {
                kind: Kind::Any,
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

    /// Reads one walk: its entry, `expr`, its end.
    fn read(&mut self, expr: &Expr, entry: Entry, helper: Option<usize>) {
        let mut tokens = vec![Token {
            kind: Kind::Entry,
            optional: false,
            site: None,
            end: 0,
        }];
        self.emit(expr, false, &mut tokens);
        tokens.push(Token {
            kind: Kind::End,
            optional: false,
            site: None,
            end: 0,
        });
        self.walks.push(Walk {
            entry,
            helper,
            tokens,
        });
    }

    /// Reads every walk of the module: each helper's returns, then every
    /// outermost call no walk holds.
    fn read_module(&mut self, module: &Module) {
        let functions = self.functions;
        for (index, helper) in functions.helpers.iter().enumerate() {
            for r in &helper.returns {
                self.read(r, Entry::Helper(index), Some(index));
            }
        }
        module.visit_with(self);
    }

    /// Marks each named node of the module's walks whose first place may change
    /// between renders: some render puts a cut or the walk's start before it with
    /// no rule after, and another a rule.
    fn choose(&self, carriers: &mut HashSet<Site>) {
        let helpers = &self.functions.helpers;
        // What comes before each helper's calls, and what its returns may leave
        // after a call, from no paths up to a fixpoint. A call outside every walk
        // may have anything before it.
        let mut entries: Vec<(bool, bool)> = helpers
            .iter()
            .map(|h| {
                let outside = h.calls.iter().any(|c| !self.called.contains(c));
                (outside, outside)
            })
            .collect();
        // A helper may also end without returning a tree.
        let mut leaves: Vec<Reach> = vec![
            Reach {
                entry: true,
                ..Reach::default()
            };
            helpers.len()
        ];
        loop {
            let mut changed = false;
            for walk in &self.walks {
                for (at, token) in walk.tokens.iter().enumerate() {
                    if let Kind::Call(helper) = token.kind {
                        let (first, rule) = resolve(walk, at, &entries, &leaves);
                        let joined = (entries[helper].0 || first, entries[helper].1 || rule);
                        if joined != entries[helper] {
                            entries[helper] = joined;
                            changed = true;
                        }
                    }
                }
                if let Some(helper) = walk.helper {
                    let left = scan(&walk.tokens, walk.tokens.len() - 1, &leaves);
                    let joined = Reach {
                        first: leaves[helper].first || left.first,
                        rule: leaves[helper].rule || left.rule,
                        entry: leaves[helper].entry || left.entry,
                    };
                    if joined != leaves[helper] {
                        leaves[helper] = joined;
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }
        for walk in &self.walks {
            for (at, token) in walk.tokens.iter().enumerate() {
                if token.kind != Kind::Named {
                    continue;
                }
                let (first, rule) = resolve(walk, at, &entries, &leaves);
                if first
                    && rule
                    && let Some(site) = token.site
                {
                    carriers.insert(site);
                }
            }
        }
    }
}

/// What may come before position `at` of a walk since the last cut, reading
/// back to the first token there on every render that ends the stretch.
fn scan(tokens: &[Token], at: usize, leaves: &[Reach]) -> Reach {
    let mut reach = Reach::default();
    for other in tokens[..at].iter().rev() {
        // A host holding the node is there whenever the node is.
        let always = !other.optional || other.end > at;
        match other.kind {
            Kind::Plain | Kind::End => {}
            Kind::MaybeRule => reach.rule = true,
            Kind::Named | Kind::Runtime => {
                reach.rule = true;
                if always {
                    break;
                }
            }
            Kind::Component => {
                reach.first = true;
                if always {
                    break;
                }
            }
            Kind::Any => {
                reach.first = true;
                reach.rule = true;
            }
            Kind::Call(helper) => {
                let left = leaves[helper];
                reach.first |= left.first;
                reach.rule |= left.rule;
                if always && !left.entry {
                    break;
                }
            }
            Kind::Entry => {
                reach.entry = true;
                break;
            }
        }
    }
    reach
}

/// Whether some render may put a cut or the walk's start before position `at`
/// with no rule after it, and whether some render may put a rule there.
fn resolve(walk: &Walk, at: usize, entries: &[(bool, bool)], leaves: &[Reach]) -> (bool, bool) {
    let reach = scan(&walk.tokens, at, leaves);
    let (first, rule) = match walk.entry {
        Entry::Start => (true, false),
        Entry::Varies => (true, true),
        Entry::Helper(helper) => entries[helper],
    };
    (
        reach.first || (reach.entry && first),
        reach.rule || (reach.entry && rule),
    )
}

impl Visit for Walks<'_> {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        let root =
            self.is_host(call) || (self.factory_calls_named && self.sites.site_of(call).is_some());
        let site = site_of(call);
        if root && !self.consumed.contains(&site) {
            let entry = if self.functions.starts.contains(&site) {
                Entry::Start
            } else {
                Entry::Varies
            };
            self.read(&Expr::Call(call.clone()), entry, None);
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

/// Adds the mark to the carriers' compiled props. A call of an imported
/// factory carries its mark on its site instead: its props are the ones it is
/// made with if the runtime does not join it, which carry none.
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

/// Marks the carriers of every walk in `module`.
pub fn mark(module: &mut Module, scope: &ModuleScope, sites: &mut FactorySites) {
    // A call of an imported factory is a named node or a component, which only
    // the runtime knows. A mark is never wrong, only one missing is, so the
    // marks are those of both readings.
    let functions = Functions::collect(module, scope, sites);
    let mut carriers = HashSet::new();
    for factory_calls_named in [false, true] {
        let mut walks = Walks {
            scope,
            sites,
            functions: &functions,
            factory_calls_named,
            consumed: HashSet::new(),
            called: HashSet::new(),
            walks: Vec::new(),
        };
        walks.read_module(module);
        walks.choose(&mut carriers);
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
    use std::collections::{BTreeSet, HashSet};

    use swc_core::common::sync::Lrc;
    use swc_core::common::{FileName, GLOBALS, Globals, Mark, SourceMap};
    use swc_core::ecma::ast::*;
    use swc_core::ecma::parser::lexer::Lexer;
    use swc_core::ecma::parser::{EsSyntax, Parser, StringInput, Syntax};
    use swc_core::ecma::transforms::base::resolver;
    use swc_core::ecma::visit::{Visit, VisitMutWith, VisitWith};

    use super::{CARRIER_KEY, key_name};
    use crate::config::CompileConfig;
    use crate::partition::transform_program;

    const IMPORTS: &str = "import { Activity, Div, Node, Row, Span, Suspense } from '@meonode/ui'\nimport { SuspenseList } from 'react'\nimport { Card } from './card'\n";

    /// The `data-i` of every call site the transform marks as a carrier, for
    /// `src` after the imports, with extraction on or off.
    fn carriers_with(src: &str, extract: bool) -> BTreeSet<i64> {
        module_carriers(&format!("{IMPORTS}{src}"), extract)
    }

    /// The `data-i` of every call site the transform marks as a carrier in the
    /// whole module `src`, imports included.
    fn module_carriers(src: &str, extract: bool) -> BTreeSet<i64> {
        let src = src.to_string();
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

            // A call of an imported factory carries its mark on its site: the
            // `__meoSite<n>` const with `r: 1`, named by the call's second argument.
            struct Sites {
                marked: HashSet<String>,
                found: BTreeSet<i64>,
            }
            impl Visit for Sites {
                fn visit_var_declarator(&mut self, decl: &VarDeclarator) {
                    if let Pat::Ident(name) = &decl.name
                        && name.id.sym.starts_with("__meoSite")
                        && let Some(init) = &decl.init
                        && let Expr::Object(obj) = &**init
                        && obj.props.iter().any(|p| key_name(p) == Some("r"))
                    {
                        self.marked.insert(name.id.sym.to_string());
                    }
                    decl.visit_children_with(self);
                }
                fn visit_call_expr(&mut self, call: &CallExpr) {
                    if let Callee::Expr(callee) = &call.callee
                        && let Expr::Ident(f) = &**callee
                        && f.sym.as_ref() == "__meoFactoryCall"
                        && let Some(site) = call.args.get(1)
                        && let Expr::Ident(site) = &*site.expr
                        && self.marked.contains(site.sym.as_ref())
                    {
                        let id = call.args.iter().find_map(|arg| match &*arg.expr {
                            Expr::Object(o) => o.props.iter().find_map(|p| match p {
                                PropOrSpread::Prop(p) => match &**p {
                                    Prop::KeyValue(kv)
                                        if matches!(&kv.key, PropName::Str(s) if s.value.as_str() == Some("data-i")) =>
                                    {
                                        match &*kv.value {
                                            Expr::Lit(Lit::Num(n)) => Some(n.value as i64),
                                            _ => None,
                                        }
                                    }
                                    _ => None,
                                },
                                _ => None,
                            }),
                            _ => None,
                        });
                        // Calls without a `data-i` are the tests' components.
                        if let Some(id) = id {
                            self.found.insert(id);
                        }
                    }
                    call.visit_children_with(self);
                }
            }
            let mut sites = Sites {
                marked: HashSet::new(),
                found: BTreeSet::new(),
            };
            program.visit_with(&mut sites);
            collector.0.into_iter().chain(sites.found).collect()
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
    fn marks_a_stretch_ending_at_a_spread_list() {
        // The list's items may render a component: a cut on the renders that
        // have one.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Div({ padding: 1, 'data-i': 1, children: [...s.items.map(item => Div({ width: w })), Div({ width: w })] })] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn marks_a_stretch_ending_at_a_single_child_read_at_run_time() {
        // The walk does not enter an element with a read inside, which may
        // render a component.
        assert_eq!(
            carriers(
                "export const P = (w, s) => Div({ width: w, children: [Card(), Div({ padding: 1, 'data-i': 1, children: <div>{w}</div> }), Div({ width: w })] })"
            ),
            set(&[1])
        );
    }

    #[test]
    fn leaves_a_memoized_node_after_a_named_sibling_unmarked() {
        // A host with `deps` is a cut before it on both sides, and the browser
        // renders it in a walk of its own: it is first on every render.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Span('a', { color: 'red', 'data-i': 1 }), Span('b', { color: 'blue', 'data-i': 2 }, []), Div({ width: w })] })"
            ),
            set(&[])
        );
    }

    #[test]
    fn marks_a_named_node_after_a_memoized_one() {
        // The memoized node's walk ends before it in the browser, and goes on
        // through it on the server, where the memoized node is a rule before it.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Span('b', { color: 'blue', 'data-i': 2 }, []), Span('c', { color: 'green', 'data-i': 3 }), Card()] })"
            ),
            set(&[3])
        );
    }

    #[test]
    fn leaves_a_memoized_parent_unmarked() {
        // It begins its own walk in the browser and follows a cut on the server.
        assert_eq!(
            carriers(
                "export const P = (w) => Div({ width: w, children: [Card(), Row({ gap: 1, 'data-i': 0, children: [Span('a', { color: 'red', 'data-i': 1 })] }, [w]), Div({ width: w })] })"
            ),
            set(&[])
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
        // The next item's component cuts before the runtime node after the
        // list.
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

    /// An app written as applications write one: components that `.render()`
    /// their trees, a provider at the root, lists of components and of named
    /// nodes. Every named call site carries a `data-i`.
    const APP: &str = r#"
import { A, Button, Center, Column, Div, Footer, Grid, H2, H3, Header, Li, Main, Nav, Node, P, Row, Span, ThemeProvider, Ul } from '@meonode/ui'
function CardHeader({ item, index }) {
  return Row({ 'data-i': 1, alignItems: 'center', gap: 'theme.space.sm', children: [
    Div({ width: 32, height: 32, backgroundColor: item.accent }),
    Div({ children: [
      H3(item.title, { 'data-i': 2, margin: 0, color: 'theme.color.text' }),
      Span(item.subtitle, { 'data-i': 3, fontSize: 'theme.text.xs' }),
    ] }),
    Span(`#${index}`, { 'data-i': 4, marginLeft: 'auto' }),
    Center({ 'data-i': 5, width: 20, height: 20, children: Span('*') }),
  ] }).render()
}
function CardStats({ item, highlight }) {
  return Ul({ 'data-i': 6, margin: 0, padding: 0, children: [
    Row({ key: 'head', 'data-i': 7, justifyContent: 'space-between', children: [Span('Stats'), Span(`${item.stats.length}`)] }),
    ...item.stats.map((stat, s) => Li({ key: s, 'data-i': 8, display: 'flex', children: [
      Span(stat.label),
      Span(`${stat.value}`, { 'data-i': 9, fontWeight: highlight === s ? 700 : 400 }),
    ] })),
  ] }).render()
}
function CardFooter({ item, index }) {
  const aria = { 'aria-label': `Open card ${index}` }
  return Row({ 'data-i': 10, justifyContent: 'space-between', children: [
    Button('Open', { padding: '4px 10px', backgroundColor: item.accent, css: { '&:hover': { opacity: 0.9 } } }),
    Span('Details', { ...aria, fontSize: 'theme.text.xs' }),
    Div({ children: [Span('Due '), Span(`day ${index % 28}`)] }),
    A({ 'data-i': 11, href: '#', color: 'theme.color.link', children: 'Share' }),
  ] }).render()
}
function Card({ index, v, selected }) {
  const item = itemOf(index, v)
  return Column({ 'data-i': 12, gap: 'theme.space.sm', borderColor: selected ? 'theme.color.primary' : 'theme.color.border', children: [
    Node(CardHeader, { item, index }),
    P(item.body, { 'data-i': 13, margin: 0, lineHeight: 1.5 }),
    Div({ 'data-i': 14, display: 'flex', flexWrap: 'wrap', children: Array.from({ length: 3 }, (_, t) =>
      Span(`tag ${t}`, { key: t, 'data-i': 15, padding: '2px 6px', css: { '&:hover': { backgroundColor: 'theme.color.tagHover' } } }),
    ) }),
    Div({ 'data-i': 16, height: 4, children: Div({ height: '100%', width: `${item.progress}%` }) }),
    Node(CardStats, { item, highlight: selected ? 0 : -1 }),
    Div({ children: [Span('Owner'), Span(' · '), Span(`team ${index % 7}`)] }),
    Node(CardFooter, { item, index }),
  ] }).render()
}
function SectionBlock({ section, v, selected }) {
  return Column({ 'data-i': 17, gap: 'theme.space.md', children: [
    H2(`Section ${section}`, { 'data-i': 18, margin: 0 }),
    Grid({ 'data-i': 19, gap: 'theme.space.md', children: Array.from({ length: 25 }, (_, c) => Node(Card, { key: c, index: section * 25 + c, v, selected })) }),
  ] }).render()
}
export function App({ v, selected }) {
  return ThemeProvider({ tokens, children: Column({ 'data-i': 20, minHeight: '100%', children: [
    Header({ 'data-i': 21, display: 'flex', padding: 'theme.space.md', children: [
      Span('MeoNode', { 'data-i': 22, fontWeight: 700 }),
      Nav({ 'data-i': 23, display: 'flex', children: Array.from({ length: 12 }, (_, l) =>
        A({ key: l, 'data-i': 24, href: '#', color: l === v % 12 ? 'theme.color.primary' : 'theme.color.muted', children: `Link ${l}` }),
      ) }),
    ] }),
    Main({ 'data-i': 25, padding: 'theme.space.lg', children: Array.from({ length: 10 }, (_, section) => Node(SectionBlock, { key: section, section, v, selected })) }),
    Footer({ 'data-i': 26, padding: 'theme.space.md', children: Span(`Version ${v}`) }),
  ] }) }).render()
}
"#;

    #[test]
    fn marks_only_the_app_nodes_whose_first_place_may_change() {
        // Each component's root begins its walk, and `P` follows a component on
        // every render: the runtime makes those carriers on every render. A node
        // with a named node before it, and nothing between that may be a
        // component, is never first. The footer may follow a component (a
        // section) or a named node (`Main`, with no sections), by the length of
        // a list. And a node after a child read at run time (`item.title`,
        // `item.subtitle`, `stat.label`, `item.body`) follows a component on a
        // render where the read is an element of one, and a named node where it
        // is text.
        assert_eq!(module_carriers(APP, true), set(&[3, 4, 8, 9, 14, 26]));
    }

    #[test]
    fn reads_a_host_swapped_to_a_value_as_a_possible_cut() {
        // `as` holding a component renders it in the host's place; a tag string
        // renders a host.
        let src = |swap: &str| {
            format!(
                "export function C({{ X }}) {{ return Div({{ padding: 1, children: [Div({{ as: {swap}, children: 'x' }}), Span('a', {{ color: 'red', 'data-i': 2 }})] }}).render() }}"
            )
        };
        assert_eq!(carriers(&src("X")), set(&[2]));
        assert_eq!(carriers(&src("'button'")), set(&[]));
    }

    #[test]
    fn reads_a_spread_as_a_possible_swap_unless_its_object_holds_no_as() {
        let src = |decl: &str, extra: &str| {
            format!(
                "export function C({{ X, f }}) {{ {decl}; {extra}; return Div({{ padding: 1, children: [Span('d', {{ ...extra_props, fontSize: 1 }}), Span('a', {{ color: 'red', 'data-i': 2 }})] }}).render() }}"
            )
        };
        // A `const` object of plain keys, read only as a spread, holds no `as`.
        assert_eq!(
            carriers(&src("const extra_props = { role: 'button' }", "")),
            set(&[])
        );
        // One holding `as`, one handed to a call, which may add it, and a binding of
        // any other value may each swap the host.
        assert_eq!(
            carriers(&src("const extra_props = { as: X }", "")),
            set(&[2])
        );
        assert_eq!(
            carriers(&src(
                "const extra_props = { role: 'button' }",
                "f(extra_props)"
            )),
            set(&[2])
        );
        assert_eq!(carriers(&src("const extra_props = f()", "")), set(&[2]));
    }

    #[test]
    fn leaves_a_node_after_text_children_unmarked() {
        // Literal and template children are text on every render.
        assert_eq!(
            carriers(
                "export function C({ n }) { return Div({ padding: 1, children: [Span('a', { color: 'red' }), Span(`b ${n}`, { color: 'blue', 'data-i': 2 })] }).render() }"
            ),
            set(&[])
        );
    }

    /// Styled chains built by a helper the module calls itself, as the gate's
    /// chain case is.
    const CHAIN: &str = r#"
import { Div, Span } from '@meonode/ui'
function chain(level, v) {
  if (level === 100) return Span(`leaf ${v}`, { 'data-i': 1, color: v % 2 ? 'red' : 'blue' })
  return Div({ 'data-i': 2, paddingLeft: 1, children: chain(level + 1, v) })
}
export function App({ v }) {
  return Div({ 'data-i': 3, display: 'grid', children: Array.from({ length: 20 }, (_, c) => Div({ key: c, children: chain(0, v) })) }).render()
}
"#;

    #[test]
    fn marks_no_node_of_a_helper_whose_callers_all_put_a_rule_before_it() {
        // `chain` is called under a named node: in `App`, and in its own level.
        assert_eq!(module_carriers(CHAIN, true), set(&[]));
    }

    #[test]
    fn marks_a_helper_root_where_a_caller_may_put_no_rule_before_it() {
        // The call follows a node that may be absent, under a host with no style.
        assert_eq!(
            carriers(
                "function part() { return Span('p', { color: 'red', 'data-i': 1 }) }\nexport function C({ a }) { return Div({ children: [a && Span('x', { color: 'blue', 'data-i': 2 }), part()] }).render() }"
            ),
            set(&[1, 2])
        );
    }

    #[test]
    fn marks_the_root_of_an_exported_helper() {
        // Callers in other modules may put anything before it.
        assert_eq!(
            carriers(
                "export function part() { return Span('p', { color: 'red', 'data-i': 1 }) }\nexport function C() { return Div({ display: 'flex', 'data-i': 2, children: [part()] }).render() }"
            ),
            set(&[1])
        );
    }

    #[test]
    fn marks_the_root_of_a_helper_used_as_a_value() {
        assert_eq!(
            carriers(
                "function part() { return Span('p', { color: 'red', 'data-i': 1 }) }\nexport const parts = [part]\nexport function C() { return Div({ display: 'flex', 'data-i': 2, children: [part()] }).render() }"
            ),
            set(&[1])
        );
    }

    #[test]
    fn marks_a_node_after_a_helper_that_may_render_nothing() {
        // `maybe` adds a named node on some renders and nothing on others, so the
        // node after its call may be first or not.
        assert_eq!(
            carriers(
                "function maybe(a) { if (a) return Span('a', { color: 'red', 'data-i': 1 }); return null }\nexport function C({ a }) { return Div({ children: [maybe(a), Span('b', { color: 'blue', 'data-i': 2 })] }).render() }"
            ),
            set(&[2])
        );
    }

    #[test]
    fn leaves_roots_that_begin_their_walk_unmarked() {
        // A `.render()`ed tree, the child of a pass-through provider, and the tree
        // a `Component` function returns each begin a walk on every render.
        for src in [
            "export function C() { return Div({ padding: 1, 'data-i': 1, children: [Card(), Span('a', { color: 'red', 'data-i': 2 })] }).render() }",
            "import { ThemeProvider } from '@meonode/ui'\nexport function C() { return ThemeProvider({ tokens: {}, children: Div({ padding: 1, 'data-i': 1 }) }).render() }",
            "import { Component } from '@meonode/ui'\nexport const C = Component(() => Div({ padding: 1, 'data-i': 1 }))",
        ] {
            let marks = carriers(src);
            assert!(!marks.contains(&1), "{src}: {marks:?}");
        }
    }

    #[test]
    fn leaves_a_node_after_a_local_component_unmarked() {
        // `Node(Local)` cuts the walk on every render, so the node is first.
        assert_eq!(
            carriers(
                "function Local() { return null }\nexport function C() { return Div({ padding: 1, 'data-i': 1, children: [Node(Local), Span('a', { color: 'red', 'data-i': 2 })] }).render() }"
            ),
            set(&[])
        );
    }

    #[test]
    fn marks_a_factory_call_after_one_on_every_render() {
        // A function may return a component's element on one render and a
        // node on the next, so the call after it may be first on some.
        assert_eq!(
            module_carriers(
                "import { Card, Title } from './nodes'\nexport function C() { return Card({ padding: 1, 'data-i': 0, children: [Title({ 'data-i': 1 }), Card({ padding: 2, 'data-i': 2 })] }).render() }",
                true
            ),
            set(&[2])
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
