//! Which bindings hold the `children` a component or helper was handed.
//!
//! A wrapper written as `({ children }) => Div({ children })` renders the
//! children its caller wrote. Those may be a hand-written array, which needs
//! no keys, so the wrapper's own call site is no place to report an unkeyed
//! list: it would point at a list nobody generated there. This pass finds the
//! bindings whose value is a caller's `children`, unchanged, so
//! [`crate::detect`] can classify a call site reading one as
//! [`crate::detect::ChildrenOrigin::PassedThrough`].
//!
//! A binding qualifies only when it is, or is an unchanged alias of:
//!
//! - the `children` property destructured from a function's first parameter
//!   (`({ children })`, `({ children: kids })`, with no default or an authored
//!   one), or
//! - a read of `.children` on that first parameter, or on its `...rest`
//!   (`props.children`, `props?.children`, `props['children']`, `rest.children`).
//!
//! A function passed inline as an argument to a call does not count, except to
//! React's `memo` and `forwardRef`: an inline callback's first parameter is
//! whatever the callee hands it, such as a data row in
//! `rows.map(({ children }) => …)`, not a caller's props.
//!
//! Any assignment to a binding anywhere in the file disqualifies it, and so
//! does an assignment to `.children` through a props object, since its value
//! is then no longer the one the caller passed. Changing the array in place
//! through a method (`children.push(extra)`) is not tracked: the binding still
//! counts as passed through.
//!
//! Requires the resolver to have run, as [`crate::detect`] does: bindings are
//! matched by `(sym, ctxt)`.

use std::collections::{HashMap, HashSet};

use swc_core::common::Span;
use swc_core::ecma::ast::*;
use swc_core::ecma::atoms::Atom;
use swc_core::ecma::visit::{Visit, VisitWith};

use crate::detect::{BindKey, CandidateKind, ChildrenOrigin, written_children_origin};

const REACT_MODULE: &str = "react";
const CHILDREN_KEY: &str = "children";
const PROPS_KEY: &str = "props";
/// React's component wrappers, whose function argument is a component taking
/// props as its first parameter.
const REACT_COMPONENT_WRAPPERS: [&str; 2] = ["memo", "forwardRef"];

/// The bindings found to carry a caller's `children` through unchanged.
#[derive(Debug, Default)]
pub(crate) struct PassThrough {
    /// Bindings whose value is a caller's `children`.
    values: HashSet<BindKey>,
    /// Bindings whose value is a caller's props object (or its `...rest`), so
    /// that their `.children` is a caller's `children`.
    props_objects: HashSet<BindKey>,
}

impl PassThrough {
    /// Whether `expr` reads a caller's `children` unchanged. `this_is_instance`
    /// says whether `this` at the expression is a class instance, which makes
    /// `this.props.children` such a read.
    pub(crate) fn is_passed_through(&self, expr: &Expr, this_is_instance: bool) -> bool {
        match unwrap_transparent(expr) {
            Expr::Ident(id) => self.values.contains(&key_of(id)),
            Expr::Member(m) => self.is_children_of_props(m, this_is_instance),
            Expr::OptChain(chain) => match &*chain.base {
                OptChainBase::Member(m) => self.is_children_of_props(m, this_is_instance),
                OptChainBase::Call(_) => false,
            },
            _ => false,
        }
    }

    /// Whether the shorthand `{ children }` reads a caller's `children`.
    pub(crate) fn is_passed_through_ident(&self, id: &Ident) -> bool {
        self.values.contains(&key_of(id))
    }

    fn is_children_of_props(&self, m: &MemberExpr, this_is_instance: bool) -> bool {
        if !is_children_prop(&m.prop) {
            return false;
        }
        match unwrap_transparent(&m.obj) {
            Expr::Ident(id) => self.props_objects.contains(&key_of(id)),
            Expr::Member(inner) => {
                this_is_instance
                    && matches!(unwrap_transparent(&inner.obj), Expr::This(_))
                    && matches!(&inner.prop, MemberProp::Ident(p) if p.sym.as_ref() == PROPS_KEY)
            }
            _ => false,
        }
    }
}

/// Finds the pass-through bindings in `program`. `factories` is the tracked
/// factory table, which [`written_children_origin`] needs to judge a default
/// value.
pub(crate) fn collect(
    program: &Program,
    factories: &HashMap<BindKey, CandidateKind>,
) -> PassThrough {
    let mut react = ReactImports::default();
    program.visit_with(&mut react);

    let mut c = Collector {
        react: &react,
        factories,
        callbacks: HashSet::new(),
        found: PassThrough::default(),
        param_keys: HashSet::new(),
        declared: HashMap::new(),
        disqualified: HashSet::new(),
        decls: Vec::new(),
    };
    program.visit_with(&mut c);
    c.finish()
}

/// `react`'s component wrappers and the names it is imported under.
#[derive(Default)]
struct ReactImports {
    /// `memo` / `forwardRef` imported by name.
    wrappers: HashSet<BindKey>,
    /// A default or namespace import, read as `React.memo`.
    namespaces: HashSet<BindKey>,
}

impl Visit for ReactImports {
    fn visit_import_decl(&mut self, n: &ImportDecl) {
        if n.type_only || n.src.value.as_str() != Some(REACT_MODULE) {
            return;
        }
        for spec in &n.specifiers {
            match spec {
                ImportSpecifier::Named(named) if !named.is_type_only => {
                    let imported = match &named.imported {
                        Some(ModuleExportName::Ident(id)) => id.sym.clone(),
                        Some(ModuleExportName::Str(_)) => continue,
                        None => named.local.sym.clone(),
                    };
                    if is_component_wrapper_name(&imported) {
                        self.wrappers.insert(key_of(&named.local));
                    }
                }
                ImportSpecifier::Named(_) => {}
                ImportSpecifier::Default(d) => {
                    self.namespaces.insert(key_of(&d.local));
                }
                ImportSpecifier::Namespace(ns) => {
                    self.namespaces.insert(key_of(&ns.local));
                }
            }
        }
    }
}

impl ReactImports {
    fn is_component_wrapper(&self, callee: &Callee) -> bool {
        let Callee::Expr(callee) = callee else {
            return false;
        };
        match unwrap_transparent(callee) {
            Expr::Ident(id) => self.wrappers.contains(&key_of(id)),
            Expr::Member(m) => {
                matches!(unwrap_transparent(&m.obj), Expr::Ident(ns) if self.namespaces.contains(&key_of(ns)))
                    && matches!(&m.prop, MemberProp::Ident(p) if is_component_wrapper_name(&p.sym))
            }
            _ => false,
        }
    }
}

fn is_component_wrapper_name(name: &Atom) -> bool {
    REACT_COMPONENT_WRAPPERS.contains(&name.as_ref())
}

struct Collector<'a> {
    react: &'a ReactImports,
    factories: &'a HashMap<BindKey, CandidateKind>,
    /// Spans of functions written inline as a call argument, other than to a
    /// React component wrapper.
    callbacks: HashSet<(u32, u32)>,
    found: PassThrough,
    /// Every binding a qualifying parameter introduced.
    param_keys: HashSet<BindKey>,
    /// How many times each binding is declared with `var`, `let` or `const`.
    declared: HashMap<BindKey, usize>,
    /// Bindings assigned to anywhere, or props objects whose `.children` is.
    disqualified: HashSet<BindKey>,
    /// `const x = init` declarations, resolved once every visit is done.
    decls: Vec<(Pat, Box<Expr>)>,
}

impl Visit for Collector<'_> {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if !self.react.is_component_wrapper(&call.callee) {
            self.note_callbacks(&call.args);
        }
        call.visit_children_with(self);
    }

    fn visit_new_expr(&mut self, n: &NewExpr) {
        if let Some(args) = &n.args {
            self.note_callbacks(args);
        }
        n.visit_children_with(self);
    }

    fn visit_function(&mut self, f: &Function) {
        if !self.callbacks.contains(&span_key(f.span))
            && let Some(first) = f.params.first()
        {
            self.collect_props_param(&first.pat);
        }
        f.visit_children_with(self);
    }

    fn visit_arrow_expr(&mut self, a: &ArrowExpr) {
        if !self.callbacks.contains(&span_key(a.span))
            && let Some(first) = a.params.first()
        {
            self.collect_props_param(first);
        }
        a.visit_children_with(self);
    }

    fn visit_var_declarator(&mut self, d: &VarDeclarator) {
        for id in binding_idents(&d.name) {
            *self.declared.entry(id).or_default() += 1;
        }
        if let Some(init) = &d.init {
            self.decls.push((d.name.clone(), init.clone()));
        }
        d.visit_children_with(self);
    }

    fn visit_assign_expr(&mut self, a: &AssignExpr) {
        match &a.left {
            AssignTarget::Simple(simple) => self.disqualify_simple_target(simple),
            AssignTarget::Pat(pat) => match pat {
                AssignTargetPat::Array(arr) => {
                    for elem in arr.elems.iter().flatten() {
                        self.disqualify_pat(elem);
                    }
                }
                AssignTargetPat::Object(obj) => self.disqualify_object_pat(obj),
                AssignTargetPat::Invalid(_) => {}
            },
        }
        a.visit_children_with(self);
    }

    fn visit_update_expr(&mut self, u: &UpdateExpr) {
        self.disqualify_expr_target(&u.arg);
        u.visit_children_with(self);
    }

    fn visit_unary_expr(&mut self, u: &UnaryExpr) {
        if u.op == UnaryOp::Delete {
            self.disqualify_expr_target(&u.arg);
        }
        u.visit_children_with(self);
    }

    fn visit_for_of_stmt(&mut self, s: &ForOfStmt) {
        self.disqualify_for_head(&s.left);
        s.visit_children_with(self);
    }

    fn visit_for_in_stmt(&mut self, s: &ForInStmt) {
        self.disqualify_for_head(&s.left);
        s.visit_children_with(self);
    }
}

impl Collector<'_> {
    fn note_callbacks(&mut self, args: &[ExprOrSpread]) {
        for arg in args {
            match unwrap_transparent(&arg.expr) {
                Expr::Arrow(a) => {
                    self.callbacks.insert(span_key(a.span));
                }
                Expr::Fn(f) => {
                    self.callbacks.insert(span_key(f.function.span));
                }
                _ => {}
            }
        }
    }

    /// A function's first parameter: the props object, or a pattern over it.
    fn collect_props_param(&mut self, pat: &Pat) {
        match pat {
            // The whole props object: its `.children` is the caller's. The
            // binding itself is never read as children, so a helper that takes
            // its children positionally, `(children) => Div({ children })`,
            // stays generated: its caller can pass any value, a `.map()` result
            // included, and nothing marks that caller.
            Pat::Ident(b) => {
                self.param_keys.insert(key_of(&b.id));
                self.found.props_objects.insert(key_of(&b.id));
            }
            Pat::Object(obj) => {
                self.param_keys.extend(binding_idents(pat));
                self.collect_props_pattern(obj);
            }
            // `({ children } = {})`: the default object stands in for absent
            // props, and has no `children` of its own to pass.
            Pat::Assign(a) => self.collect_props_param(&a.left),
            _ => {}
        }
    }

    /// An object pattern over a props object.
    fn collect_props_pattern(&mut self, obj: &ObjectPat) {
        for prop in &obj.props {
            match prop {
                ObjectPatProp::KeyValue(kv) if is_children_prop_name(&kv.key) => match &*kv.value {
                    Pat::Ident(b) => {
                        self.found.values.insert(key_of(&b.id));
                    }
                    Pat::Assign(a) if self.is_authored_default(&a.right) => {
                        if let Pat::Ident(b) = &*a.left {
                            self.found.values.insert(key_of(&b.id));
                        }
                    }
                    _ => {}
                },
                ObjectPatProp::Assign(a) if a.key.sym.as_ref() == CHILDREN_KEY => {
                    if a.value
                        .as_deref()
                        .is_none_or(|d| self.is_authored_default(d))
                    {
                        self.found.values.insert(key_of(&a.key.id));
                    }
                }
                ObjectPatProp::Rest(rest) => {
                    if let Pat::Ident(b) = &*rest.arg {
                        self.found.props_objects.insert(key_of(&b.id));
                    }
                }
                _ => {}
            }
        }
    }

    /// A default used when no `children` were passed is itself a list written
    /// in the wrapper, so it passes only when it is one written out by hand.
    fn is_authored_default(&self, default: &Expr) -> bool {
        written_children_origin(default, self.factories) == ChildrenOrigin::Authored
    }

    fn disqualify_simple_target(&mut self, t: &SimpleAssignTarget) {
        match t {
            SimpleAssignTarget::Ident(b) => {
                self.disqualified.insert(key_of(&b.id));
            }
            SimpleAssignTarget::Member(m) => self.disqualify_children_write(m),
            SimpleAssignTarget::Paren(p) => self.disqualify_expr_target(&p.expr),
            SimpleAssignTarget::TsAs(t) => self.disqualify_expr_target(&t.expr),
            SimpleAssignTarget::TsSatisfies(t) => self.disqualify_expr_target(&t.expr),
            SimpleAssignTarget::TsNonNull(t) => self.disqualify_expr_target(&t.expr),
            SimpleAssignTarget::TsTypeAssertion(t) => self.disqualify_expr_target(&t.expr),
            SimpleAssignTarget::TsInstantiation(t) => self.disqualify_expr_target(&t.expr),
            SimpleAssignTarget::OptChain(_)
            | SimpleAssignTarget::SuperProp(_)
            | SimpleAssignTarget::Invalid(_) => {}
        }
    }

    fn disqualify_expr_target(&mut self, e: &Expr) {
        match unwrap_transparent(e) {
            Expr::Ident(id) => {
                self.disqualified.insert(key_of(id));
            }
            Expr::Member(m) => self.disqualify_children_write(m),
            _ => {}
        }
    }

    /// `props.children = …` changes what every later `props.children` reads.
    fn disqualify_children_write(&mut self, m: &MemberExpr) {
        if is_children_prop(&m.prop)
            && let Expr::Ident(obj) = unwrap_transparent(&m.obj)
        {
            self.disqualified.insert(key_of(obj));
        }
    }

    fn disqualify_pat(&mut self, pat: &Pat) {
        match pat {
            Pat::Ident(b) => {
                self.disqualified.insert(key_of(&b.id));
            }
            Pat::Array(arr) => {
                for elem in arr.elems.iter().flatten() {
                    self.disqualify_pat(elem);
                }
            }
            Pat::Object(obj) => self.disqualify_object_pat(obj),
            Pat::Assign(a) => self.disqualify_pat(&a.left),
            Pat::Rest(r) => self.disqualify_pat(&r.arg),
            Pat::Expr(e) => self.disqualify_expr_target(e),
            Pat::Invalid(_) => {}
        }
    }

    fn disqualify_object_pat(&mut self, obj: &ObjectPat) {
        for prop in &obj.props {
            match prop {
                ObjectPatProp::KeyValue(kv) => self.disqualify_pat(&kv.value),
                ObjectPatProp::Assign(a) => {
                    self.disqualified.insert(key_of(&a.key.id));
                }
                ObjectPatProp::Rest(r) => self.disqualify_pat(&r.arg),
            }
        }
    }

    fn disqualify_for_head(&mut self, head: &ForHead) {
        match head {
            ForHead::Pat(p) => self.disqualify_pat(p),
            // A declaration in the head is counted by `visit_var_declarator`.
            ForHead::VarDecl(_) | ForHead::UsingDecl(_) => {}
        }
    }

    fn finish(mut self) -> PassThrough {
        // A parameter redeclared with `var`, and any binding declared twice,
        // holds whatever the later declaration gave it.
        for (key, count) in &self.declared {
            if *count > 1 || self.param_keys.contains(key) {
                self.disqualified.insert(key.clone());
            }
        }

        // Aliases may refer to one another in any order, so resolve to a
        // fixpoint: each round can only add bindings, and there are finitely
        // many.
        let decls = std::mem::take(&mut self.decls);
        loop {
            let before = self.found.values.len() + self.found.props_objects.len();
            for (pat, init) in &decls {
                self.collect_alias(pat, init);
            }
            if self.found.values.len() + self.found.props_objects.len() == before {
                break;
            }
        }

        let disqualified = &self.disqualified;
        self.found.values.retain(|k| !disqualified.contains(k));
        self.found
            .props_objects
            .retain(|k| !disqualified.contains(k));
        self.found
    }

    fn collect_alias(&mut self, pat: &Pat, init: &Expr) {
        let is_props_object = matches!(
            unwrap_transparent(init),
            Expr::Ident(id) if self.is_live(&self.found.props_objects, id)
        );
        match pat {
            Pat::Ident(b) => {
                if self.is_live_value(init) {
                    self.found.values.insert(key_of(&b.id));
                } else if is_props_object {
                    self.found.props_objects.insert(key_of(&b.id));
                }
            }
            Pat::Object(obj) if is_props_object => self.collect_props_pattern(obj),
            _ => {}
        }
    }

    fn is_live(&self, set: &HashSet<BindKey>, id: &Ident) -> bool {
        let key = key_of(id);
        set.contains(&key) && !self.disqualified.contains(&key)
    }

    /// Whether `init` reads a caller's `children` through a binding that has
    /// not been disqualified. `this.props.children` is left to the call-site
    /// check, which knows what `this` is there.
    fn is_live_value(&self, init: &Expr) -> bool {
        let member_of_props = |m: &MemberExpr| {
            is_children_prop(&m.prop)
                && matches!(unwrap_transparent(&m.obj), Expr::Ident(id) if self.is_live(&self.found.props_objects, id))
        };
        match unwrap_transparent(init) {
            Expr::Ident(id) => self.is_live(&self.found.values, id),
            Expr::Member(m) => member_of_props(m),
            Expr::OptChain(chain) => match &*chain.base {
                OptChainBase::Member(m) => member_of_props(m),
                OptChainBase::Call(_) => false,
            },
            _ => false,
        }
    }
}

/// Strips what changes neither the value nor its identity: parentheses and
/// TypeScript's type-only wrappers.
fn unwrap_transparent(mut expr: &Expr) -> &Expr {
    loop {
        expr = match expr {
            Expr::Paren(p) => &p.expr,
            Expr::TsAs(t) => &t.expr,
            Expr::TsSatisfies(t) => &t.expr,
            Expr::TsNonNull(t) => &t.expr,
            Expr::TsTypeAssertion(t) => &t.expr,
            Expr::TsConstAssertion(t) => &t.expr,
            Expr::TsInstantiation(t) => &t.expr,
            _ => return expr,
        };
    }
}

fn is_children_prop(prop: &MemberProp) -> bool {
    match prop {
        MemberProp::Ident(id) => id.sym.as_ref() == CHILDREN_KEY,
        MemberProp::Computed(c) => matches!(
            unwrap_transparent(&c.expr),
            Expr::Lit(Lit::Str(s)) if s.value.as_str() == Some(CHILDREN_KEY)
        ),
        MemberProp::PrivateName(_) => false,
    }
}

fn is_children_prop_name(key: &PropName) -> bool {
    match key {
        PropName::Ident(id) => id.sym.as_ref() == CHILDREN_KEY,
        PropName::Str(s) => s.value.as_str() == Some(CHILDREN_KEY),
        PropName::Num(_) | PropName::BigInt(_) | PropName::Computed(_) => false,
    }
}

/// Every binding a declaration pattern introduces.
fn binding_idents(pat: &Pat) -> Vec<BindKey> {
    let mut out = Vec::new();
    collect_binding_idents(pat, &mut out);
    out
}

fn collect_binding_idents(pat: &Pat, out: &mut Vec<BindKey>) {
    match pat {
        Pat::Ident(b) => out.push(key_of(&b.id)),
        Pat::Array(arr) => {
            for elem in arr.elems.iter().flatten() {
                collect_binding_idents(elem, out);
            }
        }
        Pat::Object(obj) => {
            for prop in &obj.props {
                match prop {
                    ObjectPatProp::KeyValue(kv) => collect_binding_idents(&kv.value, out),
                    ObjectPatProp::Assign(a) => out.push(key_of(&a.key.id)),
                    ObjectPatProp::Rest(r) => collect_binding_idents(&r.arg, out),
                }
            }
        }
        Pat::Assign(a) => collect_binding_idents(&a.left, out),
        Pat::Rest(r) => collect_binding_idents(&r.arg, out),
        Pat::Expr(_) | Pat::Invalid(_) => {}
    }
}

fn key_of(id: &Ident) -> BindKey {
    (id.sym.clone(), id.ctxt)
}

fn span_key(span: Span) -> (u32, u32) {
    (span.lo.0, span.hi.0)
}
