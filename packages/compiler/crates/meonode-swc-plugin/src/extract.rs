//! Build-time CSS extraction behind `experimental_extractCss`.
//!
//! For a host factory call site that `partition` is already rewriting, every
//! style entry whose output can be proved is written as a rule at build time,
//! and the call site carries class names instead:
//!
//! ```text
//! __meoCss('<module id>', [[bucket, 'mn-…', '.mn-…{padding:8px;}'], …])
//! Div({ __meo$: 2, __meo$s: 'mn-… mn-…' + (open ? ' mn-…' : ''),
//!       __meo$v: { '--mv-…': __meoVal('width', `${w}%`) }, … })
//! ```
//!
//! Each entry takes one route:
//! - STATIC: a literal, a token string or a same-file `const` literal.
//! - SWITCH: a conditional whose branches are all STATIC (or omitted); an
//!   expression picks the class.
//! - VAR: a value that is provably a string or a number (a template literal,
//!   arithmetic); the rule reads `var(--mv-…)` and the element's style sets it.
//! - RUNTIME: anything else, left where it was for the runtime.
//!
//! The output must render exactly what the runtime renders. Every rule here
//! exists for that:
//! - Values follow Emotion: kebab-case names, `px` on numbers where
//!   `@emotion/unitless` does not list the key, stylis's whitespace handling
//!   and Emotion's vendor prefixer (see `stylis.rs`).
//! - The runtime's sheet comes after the static one, so it wins ties. A
//!   property is therefore never split between the two paths on one node: a
//!   static entry that overlaps a runtime one in any context moves to the
//!   runtime too.
//! - Atomic rules cannot keep an author's order between two declarations, so
//!   order-dependent shapes stay on the runtime path: two overlapping
//!   properties in one context (`padding` and `paddingTop`), and one property
//!   in two or more non-base contexts (`:hover` and `:focus`, two media
//!   queries).
//! - `resolveDefaultStyle`'s defaults (`flex-shrink`, `min-height`,
//!   `min-width`) read the whole style. When everything is extracted they are
//!   computed here and written as classes; when anything is left, every entry
//!   they read or write stays on the runtime path, and the runtime computes
//!   them from it as before.

use std::collections::{HashMap, HashSet};

use swc_core::common::{DUMMY_SP, SyntaxContext};
use swc_core::ecma::ast::*;
use swc_core::ecma::atoms::Atom;

use crate::extract_tables::{is_host_factory, is_unitless};
use crate::keys::key_name_atom;
use crate::style_name::{class_name, hash_styles};
use crate::stylis;
use crate::theme::{is_length_key, rewrite_theme_tokens_for};

/// The module the runtime helpers are imported from.
const UI_MODULE: &str = "@meonode/ui";
const UI_MODULE_CLIENT: &str = "@meonode/ui/client";
/// Local names of the imported helpers.
pub const REGISTER_LOCAL: &str = "__meoCss";
pub const VALUE_LOCAL: &str = "__meoVal";
const REGISTER_EXPORT: &str = "registerStaticCss";
const VALUE_EXPORT: &str = "toCssValue";
/// Marker keys the call site carries.
pub const CLASSES_KEY: &str = "__meo$s";
pub const VARIABLES_KEY: &str = "__meo$v";
/// Prefix of the custom properties VAR values travel in.
const VARIABLE_PREFIX: &str = "--mv-";

/// Rule buckets, in the order the runtime keeps them across modules.
const BUCKET_BASE: u8 = 0;
const BUCKET_PSEUDO: u8 = 1;
const BUCKET_AT_RULE: u8 = 2;
const BUCKET_PER_NODE: u8 = 3;

/// Separator between the parts of a hashed context, as the contract names it.
const SEP: char = '\u{0}';

/// Keys `resolveDefaultStyle` reads or writes.
const DEFAULT_KEYS: &[&str] = &[
    "display",
    "overflow",
    "overflowX",
    "overflowY",
    "flexFlow",
    "flexWrap",
    "flexDirection",
    "flex",
    "flexShrink",
    "minHeight",
    "minWidth",
];

/// Keys Emotion or the runtime treat specially; a node holding one is not
/// extracted.
const RESERVED_STYLE_KEYS: &[&str] = &["label", "styles"];

/// Top-level props whose presence changes how the runtime styles the node.
const BLOCKING_PROPS: &[&str] = &["disableEmotion", "as", "theme"];

/// The JavaScript numbers this writes as the runtime would: integers and plain
/// decimals. Outside this range `Number#toString` switches to exponent form.
const PLAIN_NUMBER_MIN: f64 = 1e-6;
const PLAIN_NUMBER_MAX: f64 = 1e21;

/// One rule for the module's registration call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    pub bucket: u8,
    pub class: String,
    pub text: String,
}

/// What one module contributes: its rules, in first-use order, and which
/// helpers its call sites use.
#[derive(Debug, Default)]
pub struct ModuleExtraction {
    rules: Vec<Rule>,
    seen: HashSet<String>,
    uses_value: bool,
}

impl ModuleExtraction {
    fn add(&mut self, rule: Rule) {
        if self.seen.insert(rule.class.clone()) {
            self.rules.push(rule);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.rules.is_empty() && !self.uses_value
    }
}

/// Bindings extraction reads from the whole module before any call site.
#[derive(Debug, Default)]
pub struct ModuleScope {
    /// Local bindings of host factories imported from `@meonode/ui`.
    host_factories: HashSet<(Atom, SyntaxContext)>,
    /// Local bindings of `Node`.
    node_factories: HashSet<(Atom, SyntaxContext)>,
    /// Top-level `const NAME = <literal>` bindings.
    consts: HashMap<(Atom, SyntaxContext), Expr>,
    /// Whether the module already uses one of the helper names.
    name_taken: bool,
}

impl ModuleScope {
    /// Reads `program`'s imports and top-level `const` literals. `None` for a
    /// script, which cannot import the helpers, or a module already using one
    /// of their local names.
    pub fn collect(program: &Program) -> Option<Self> {
        let Program::Module(module) = program else {
            return None;
        };
        let mut scope = ModuleScope::default();
        for item in &module.body {
            match item {
                ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => scope.collect_import(import),
                ModuleItem::Stmt(Stmt::Decl(Decl::Var(var))) => scope.collect_consts(var),
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                    decl: Decl::Var(var),
                    ..
                })) => scope.collect_consts(var),
                _ => {}
            }
        }
        scope.name_taken =
            module_mentions(module, REGISTER_LOCAL) || module_mentions(module, VALUE_LOCAL);
        if scope.name_taken {
            return None;
        }
        Some(scope)
    }

    fn collect_import(&mut self, import: &ImportDecl) {
        if import.type_only {
            return;
        }
        let src = import.src.value.as_str().unwrap_or_default();
        if src != UI_MODULE && src != UI_MODULE_CLIENT {
            return;
        }
        for spec in &import.specifiers {
            let ImportSpecifier::Named(named) = spec else {
                continue;
            };
            if named.is_type_only {
                continue;
            }
            let imported = match &named.imported {
                Some(ModuleExportName::Ident(id)) => id.sym.clone(),
                Some(ModuleExportName::Str(_)) => continue,
                None => named.local.sym.clone(),
            };
            let key = (named.local.sym.clone(), named.local.ctxt);
            if imported.as_ref() == "Node" {
                self.node_factories.insert(key);
            } else if is_host_factory(imported.as_ref()) {
                self.host_factories.insert(key);
            }
        }
    }

    fn collect_consts(&mut self, var: &VarDecl) {
        if var.kind != VarDeclKind::Const {
            return;
        }
        for decl in &var.decls {
            let (Pat::Ident(binding), Some(init)) = (&decl.name, &decl.init) else {
                continue;
            };
            let init = unwrap_transparent(init);
            let literal = match init {
                Expr::Lit(Lit::Str(_) | Lit::Num(_)) => true,
                Expr::Tpl(tpl) => tpl.exprs.is_empty(),
                Expr::Unary(UnaryExpr {
                    op: UnaryOp::Minus,
                    arg,
                    ..
                }) => {
                    matches!(unwrap_transparent(arg), Expr::Lit(Lit::Num(_)))
                }
                _ => false,
            };
            if literal {
                self.consts
                    .insert((binding.id.sym.clone(), binding.id.ctxt), init.clone());
            }
        }
    }

    /// Whether `call` renders a plain host element: an imported host factory,
    /// or `Node` with a tag string.
    pub fn is_host_call(&self, call: &CallExpr) -> bool {
        let Callee::Expr(callee) = &call.callee else {
            return false;
        };
        let Expr::Ident(id) = &**callee else {
            return false;
        };
        let key = (id.sym.clone(), id.ctxt);
        if self.host_factories.contains(&key) {
            return true;
        }
        if self.node_factories.contains(&key) {
            return call.args.first().is_some_and(|arg| {
                arg.spread.is_none()
                    && matches!(unwrap_transparent(&arg.expr), Expr::Lit(Lit::Str(s))
                        if s.value.as_str().is_some_and(|tag| tag.starts_with(|c: char| c.is_ascii_lowercase())))
            });
        }
        false
    }
}

/// Whether any identifier in `module` is spelled `name`.
fn module_mentions(module: &Module, name: &str) -> bool {
    use swc_core::ecma::visit::{Visit, VisitWith};
    struct Finder<'a> {
        name: &'a str,
        found: bool,
    }
    impl Visit for Finder<'_> {
        fn visit_ident(&mut self, id: &Ident) {
            if id.sym.as_ref() == self.name {
                self.found = true;
            }
        }
    }
    let mut finder = Finder { name, found: false };
    module.visit_with(&mut finder);
    finder.found
}

/// Reads through parentheses and TypeScript-only wrappers, which leave the
/// value as written.
fn unwrap_transparent(mut expr: &Expr) -> &Expr {
    loop {
        expr = match expr {
            Expr::Paren(p) => &p.expr,
            Expr::TsAs(e) => &e.expr,
            Expr::TsSatisfies(e) => &e.expr,
            Expr::TsNonNull(e) => &e.expr,
            Expr::TsConstAssertion(e) => &e.expr,
            Expr::TsTypeAssertion(e) => &e.expr,
            _ => return expr,
        };
    }
}

// ---------------------------------------------------------------------------
// Values

/// A value known at build time, as JavaScript holds it.
#[derive(Debug, Clone, PartialEq)]
enum Value {
    Str(String),
    Num(f64),
}

/// How one entry is written.
#[derive(Debug, Clone)]
enum Route {
    /// No declaration (`null`, `undefined`, a boolean, `''`), though the key is
    /// present.
    Omit,
    /// A value known at build time.
    Static(Value),
    /// `test ? cons : alt`, each branch `Omit`, `Static` or another `Switch`.
    Switch(Box<Expr>, Box<Route>, Box<Route>),
    /// A value that is a string or a number at runtime.
    Var(Box<Expr>),
    /// Left to the runtime.
    Runtime,
}

impl Route {
    fn is_static_path(&self) -> bool {
        matches!(self, Route::Static(_) | Route::Switch(..) | Route::Var(_))
    }
}

/// `Number#toString` for the numbers [`plain_number`] accepts.
fn js_number(n: f64) -> Option<String> {
    if !n.is_finite() {
        return None;
    }
    if n == 0.0 {
        return Some("0".into());
    }
    let abs = n.abs();
    if !(PLAIN_NUMBER_MIN..PLAIN_NUMBER_MAX).contains(&abs) {
        return None;
    }
    if n.fract() == 0.0 {
        return Some(format!("{}", n as i64));
    }
    Some(format!("{n}"))
}

/// Whether reading `expr` can be moved within the props object it was written
/// in: identifiers, literals, member reads and operators over them.
fn is_pure_read(expr: &Expr) -> bool {
    match unwrap_transparent(expr) {
        Expr::Ident(_) | Expr::Lit(_) => true,
        Expr::Member(m) => {
            is_pure_read(&m.obj)
                && match &m.prop {
                    MemberProp::Ident(_) | MemberProp::PrivateName(_) => true,
                    MemberProp::Computed(c) => matches!(unwrap_transparent(&c.expr), Expr::Lit(_)),
                }
        }
        Expr::OptChain(chain) => match &*chain.base {
            OptChainBase::Member(m) => {
                is_pure_read(&m.obj)
                    && matches!(&m.prop, MemberProp::Ident(_) | MemberProp::PrivateName(_))
            }
            OptChainBase::Call(_) => false,
        },
        Expr::Unary(u) => {
            matches!(
                u.op,
                UnaryOp::Bang | UnaryOp::Minus | UnaryOp::Plus | UnaryOp::TypeOf
            ) && is_pure_read(&u.arg)
        }
        Expr::Bin(b) => is_pure_read(&b.left) && is_pure_read(&b.right),
        Expr::Cond(c) => is_pure_read(&c.test) && is_pure_read(&c.cons) && is_pure_read(&c.alt),
        Expr::Tpl(t) => t.exprs.iter().all(|e| is_pure_read(e)),
        _ => false,
    }
}

/// Whether `expr` is a boolean whatever its operands hold.
fn is_boolean(expr: &Expr) -> bool {
    match unwrap_transparent(expr) {
        Expr::Lit(Lit::Bool(_)) => true,
        Expr::Unary(u) => u.op == UnaryOp::Bang,
        Expr::Bin(b) => matches!(
            b.op,
            BinaryOp::EqEq
                | BinaryOp::NotEq
                | BinaryOp::EqEqEq
                | BinaryOp::NotEqEq
                | BinaryOp::Lt
                | BinaryOp::LtEq
                | BinaryOp::Gt
                | BinaryOp::GtEq
                | BinaryOp::In
                | BinaryOp::InstanceOf
        ),
        _ => false,
    }
}

impl ModuleScope {
    /// The route of `expr`.
    fn route(&self, expr: &Expr, depth: u8) -> Route {
        if depth > 8 {
            return Route::Runtime;
        }
        match unwrap_transparent(expr) {
            Expr::Lit(Lit::Str(s)) => match s.value.as_str() {
                Some("") => Route::Omit,
                Some(text) => Route::Static(Value::Str(text.to_string())),
                None => Route::Runtime,
            },
            Expr::Lit(Lit::Num(n)) => Route::Static(Value::Num(n.value)),
            Expr::Lit(Lit::Bool(_) | Lit::Null(_)) => Route::Omit,
            Expr::Tpl(tpl) if tpl.exprs.is_empty() => match tpl
                .quasis
                .first()
                .and_then(|q| q.cooked.as_ref())
                .and_then(|c| c.as_str())
            {
                Some("") => Route::Omit,
                Some(text) => Route::Static(Value::Str(text.to_string())),
                None => Route::Runtime,
            },
            Expr::Unary(UnaryExpr {
                op: UnaryOp::Minus,
                arg,
                ..
            }) if matches!(unwrap_transparent(arg), Expr::Lit(Lit::Num(_))) => {
                let Expr::Lit(Lit::Num(n)) = unwrap_transparent(arg) else {
                    unreachable!()
                };
                Route::Static(Value::Num(-n.value))
            }
            Expr::Ident(id) if id.sym.as_ref() == "undefined" => Route::Omit,
            Expr::Ident(id) => match self.consts.get(&(id.sym.clone(), id.ctxt)) {
                Some(init) => self.route(init, depth + 1),
                None => Route::Runtime,
            },
            Expr::Cond(c) if is_pure_read(&c.test) => {
                let cons = self.route(&c.cons, depth + 1);
                let alt = self.route(&c.alt, depth + 1);
                if is_switch_branch(&cons) && is_switch_branch(&alt) {
                    Route::Switch(c.test.clone(), Box::new(cons), Box::new(alt))
                } else {
                    Route::Runtime
                }
            }
            Expr::Bin(b)
                if b.op == BinaryOp::LogicalAnd && is_boolean(&b.left) && is_pure_read(&b.left) =>
            {
                let cons = self.route(&b.right, depth + 1);
                if is_switch_branch(&cons) {
                    Route::Switch(b.left.clone(), Box::new(cons), Box::new(Route::Omit))
                } else {
                    Route::Runtime
                }
            }
            Expr::Tpl(tpl) if tpl.exprs.iter().all(|e| is_pure_read(e)) => {
                let literal_text: String = tpl.quasis.iter().map(|q| q.raw.as_ref()).collect();
                if literal_text.contains("!important")
                    || tpl.quasis.iter().any(|q| q.cooked.is_none())
                {
                    Route::Runtime
                } else {
                    Route::Var(Box::new(expr.clone()))
                }
            }
            Expr::Bin(b)
                if matches!(
                    b.op,
                    BinaryOp::Add
                        | BinaryOp::Sub
                        | BinaryOp::Mul
                        | BinaryOp::Div
                        | BinaryOp::Mod
                        | BinaryOp::Exp
                ) && is_pure_read(expr) =>
            {
                Route::Var(Box::new(expr.clone()))
            }
            Expr::Unary(u)
                if matches!(u.op, UnaryOp::Minus | UnaryOp::Plus) && is_pure_read(&u.arg) =>
            {
                Route::Var(Box::new(expr.clone()))
            }
            _ => Route::Runtime,
        }
    }
}

/// `path` with `key` appended.
fn extend(path: &[String], key: &str) -> Vec<String> {
    let mut out = path.to_vec();
    out.push(key.to_string());
    out
}

/// `route`, or `Runtime` when a value in it cannot be written the way Emotion
/// writes it (see [`value_text`] and `stylis::declarations`).
fn checked(key: &str, route: Route) -> Route {
    fn writable(key: &str, route: &Route) -> bool {
        match route {
            Route::Omit | Route::Var(_) | Route::Runtime => true,
            Route::Static(value) => value_text(key, value)
                .is_some_and(|text| stylis::declarations(&property_name(key), &text).is_some()),
            Route::Switch(_, cons, alt) => writable(key, cons) && writable(key, alt),
        }
    }
    if writable(key, &route) {
        route
    } else {
        Route::Runtime
    }
}

fn is_switch_branch(route: &Route) -> bool {
    matches!(route, Route::Omit | Route::Static(_) | Route::Switch(..))
}

/// Emotion's `processStyleName`: a custom property as it is, anything else
/// with each capital and a leading `ms` turned into `-` and lower case.
fn property_name(key: &str) -> String {
    if key.as_bytes().get(1) == Some(&b'-') {
        return key.to_string();
    }
    let mut out = String::with_capacity(key.len() + 4);
    for (i, ch) in key.char_indices() {
        if ch.is_ascii_uppercase() || (i == 0 && key.starts_with("ms")) {
            out.push('-');
        }
        out.push(ch.to_ascii_lowercase());
    }
    out
}

fn is_custom_property(key: &str) -> bool {
    key.as_bytes().get(1) == Some(&b'-')
}

/// The value text Emotion writes for a static value against `key`: tokens
/// rewritten as the runtime rewrites them, and `px` where Emotion adds it.
fn value_text(key: &str, value: &Value) -> Option<String> {
    match value {
        Value::Str(s) => {
            Some(rewrite_theme_tokens_for(s, is_length_key(key)).unwrap_or_else(|| s.clone()))
        }
        Value::Num(n) => {
            let text = js_number(*n)?;
            if *n != 0.0 && !is_unitless(key) && !is_custom_property(key) {
                Some(format!("{text}px"))
            } else {
                Some(text)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Overlap between properties

/// Shorthands and the properties they set, by written name without a vendor
/// prefix. A longhand that starts with its shorthand's name and `-` is caught
/// by the prefix test in [`overlaps`] and needs no entry; the entries here are
/// the ones whose names do not show it.
const SHORTHANDS: &[(&str, &[&str])] = &[
    ("all", &["*"]),
    ("inset", &["top", "right", "bottom", "left"]),
    ("place-content", &["align-content", "justify-content"]),
    ("place-items", &["align-items", "justify-items"]),
    ("place-self", &["align-self", "justify-self"]),
    (
        "gap",
        &[
            "row-gap",
            "column-gap",
            "grid-gap",
            "grid-row-gap",
            "grid-column-gap",
        ],
    ),
    (
        "grid-gap",
        &["row-gap", "column-gap", "grid-row-gap", "grid-column-gap"],
    ),
    ("grid-row-gap", &["row-gap"]),
    ("grid-column-gap", &["column-gap"]),
    (
        "grid-area",
        &[
            "grid-row",
            "grid-column",
            "grid-row-start",
            "grid-row-end",
            "grid-column-start",
            "grid-column-end",
        ],
    ),
    (
        "grid",
        &[
            "grid-template",
            "grid-auto-rows",
            "grid-auto-columns",
            "grid-auto-flow",
            "grid-template-rows",
            "grid-template-columns",
            "grid-template-areas",
        ],
    ),
    (
        "font",
        &[
            "line-height",
            "font-size-adjust",
            "font-kerning",
            "font-optical-sizing",
            "font-variation-settings",
            "font-feature-settings",
            "font-language-override",
        ],
    ),
    ("columns", &["column-width", "column-count"]),
    ("flex-flow", &["flex-direction", "flex-wrap"]),
    (
        "white-space",
        &[
            "white-space-collapse",
            "text-wrap",
            "text-wrap-mode",
            "text-wrap-style",
        ],
    ),
    ("text-wrap", &["text-wrap-mode", "text-wrap-style"]),
    (
        "border",
        &[
            "border-image",
            "border-image-source",
            "border-image-slice",
            "border-image-width",
            "border-image-outset",
            "border-image-repeat",
            "border-color",
            "border-style",
            "border-width",
            "border-top",
            "border-right",
            "border-bottom",
            "border-left",
            "border-block",
            "border-inline",
        ],
    ),
    (
        "border-color",
        &[
            "border-top-color",
            "border-right-color",
            "border-bottom-color",
            "border-left-color",
            "border-block-color",
            "border-inline-color",
        ],
    ),
    (
        "border-style",
        &[
            "border-top-style",
            "border-right-style",
            "border-bottom-style",
            "border-left-style",
            "border-block-style",
            "border-inline-style",
        ],
    ),
    (
        "border-width",
        &[
            "border-top-width",
            "border-right-width",
            "border-bottom-width",
            "border-left-width",
            "border-block-width",
            "border-inline-width",
        ],
    ),
    (
        "border-radius",
        &[
            "border-top-left-radius",
            "border-top-right-radius",
            "border-bottom-right-radius",
            "border-bottom-left-radius",
            "border-start-start-radius",
            "border-start-end-radius",
            "border-end-start-radius",
            "border-end-end-radius",
        ],
    ),
    ("overflow", &["overflow-block", "overflow-inline"]),
    ("container", &["container-name", "container-type"]),
    (
        "contain-intrinsic-size",
        &[
            "contain-intrinsic-width",
            "contain-intrinsic-height",
            "contain-intrinsic-block-size",
            "contain-intrinsic-inline-size",
        ],
    ),
    ("marker", &["marker-start", "marker-mid", "marker-end"]),
    (
        "text-decoration",
        &[
            "text-decoration-line",
            "text-decoration-color",
            "text-decoration-style",
            "text-decoration-thickness",
        ],
    ),
    (
        "background",
        &["background-position-x", "background-position-y"],
    ),
    (
        "mask",
        &[
            "mask-border",
            "mask-border-source",
            "mask-border-slice",
            "mask-border-width",
            "mask-border-outset",
            "mask-border-repeat",
            "mask-border-mode",
        ],
    ),
];

/// Logical names and the physical properties they may stand for, depending on
/// the writing mode and direction.
const LOGICAL: &[(&str, &[&str])] = &[
    ("inline-size", &["width", "height"]),
    ("block-size", &["width", "height"]),
    ("min-inline-size", &["min-width", "min-height"]),
    ("min-block-size", &["min-width", "min-height"]),
    ("max-inline-size", &["max-width", "max-height"]),
    ("max-block-size", &["max-width", "max-height"]),
    ("overflow-inline", &["overflow-x", "overflow-y"]),
    ("overflow-block", &["overflow-x", "overflow-y"]),
    (
        "contain-intrinsic-inline-size",
        &["contain-intrinsic-width", "contain-intrinsic-height"],
    ),
    (
        "contain-intrinsic-block-size",
        &["contain-intrinsic-width", "contain-intrinsic-height"],
    ),
];

const VENDOR_PREFIXES: &[&str] = &["-webkit-", "-moz-", "-ms-", "-o-"];

/// `name` without a vendor prefix.
fn unprefixed(name: &str) -> &str {
    VENDOR_PREFIXES
        .iter()
        .find_map(|p| name.strip_prefix(p))
        .unwrap_or(name)
}

/// The physical properties `name` may set, every logical side read as all four
/// physical ones. Conservative by design: reading too much only keeps more on
/// the runtime path.
fn atoms(name: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    let mut stack = vec![unprefixed(name).to_string()];
    while let Some(current) = stack.pop() {
        if !out.insert(current.clone()) {
            continue;
        }
        for (shorthand, longhands) in SHORTHANDS {
            if *shorthand == current {
                stack.extend(longhands.iter().map(|s| s.to_string()));
            }
        }
        for (logical, physical) in LOGICAL {
            if *logical == current {
                stack.extend(physical.iter().map(|s| s.to_string()));
            }
        }
        // Logical sides: `margin-inline-start`, `inset-block`, `border-inline-color`.
        for logical in [
            "-inline-start",
            "-inline-end",
            "-block-start",
            "-block-end",
            "-inline",
            "-block",
        ] {
            if let Some(at) = current.find(logical) {
                let (head, tail) = (&current[..at], &current[at + logical.len()..]);
                let head = if head == "inset" { "" } else { head };
                for side in ["top", "right", "bottom", "left"] {
                    let physical = if head.is_empty() {
                        format!("{side}{tail}")
                    } else {
                        format!("{head}-{side}{tail}")
                    };
                    stack.push(physical);
                }
                stack.push(format!("{head}{tail}"));
            }
        }
        // Corners written logically.
        if current.starts_with("border-")
            && current.ends_with("-radius")
            && (current.contains("-start-") || current.contains("-end-"))
        {
            stack.push("border-radius".into());
            for corner in ["top-left", "top-right", "bottom-right", "bottom-left"] {
                stack.push(format!("border-{corner}-radius"));
            }
        }
    }
    out
}

/// Whether setting `a` can change what `b` computes to, or the reverse.
fn overlaps(a: &str, b: &str) -> bool {
    let (ua, ub) = (unprefixed(a), unprefixed(b));
    if ua == ub {
        return true;
    }
    let prefix_of =
        |s: &str, of: &str| of.starts_with(s) && of.as_bytes().get(s.len()) == Some(&b'-');
    if prefix_of(ua, ub) || prefix_of(ub, ua) {
        return true;
    }
    let (sa, sb) = (atoms(ua), atoms(ub));
    if sa.contains("*") || sb.contains("*") {
        return true;
    }
    sa.iter()
        .any(|x| sb.contains(x) || sb.iter().any(|y| prefix_of(x, y) || prefix_of(y, x)))
}

// ---------------------------------------------------------------------------
// The node's css as the runtime merges it

/// Where a declaration is written: the at-rules around it and the selector
/// suffix after the element's class (`""`, `":hover"`, `"::before"`).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct Context {
    at_rules: Vec<String>,
    selector: String,
}

impl Context {
    fn base() -> Self {
        Context {
            at_rules: Vec::new(),
            selector: String::new(),
        }
    }

    fn is_base(&self) -> bool {
        self.at_rules.is_empty() && self.selector.is_empty()
    }

    fn bucket(&self) -> u8 {
        if !self.at_rules.is_empty() {
            BUCKET_AT_RULE
        } else if !self.selector.is_empty() {
            BUCKET_PSEUDO
        } else {
            BUCKET_BASE
        }
    }

    /// The context as hashed: at-rules then the selector, joined by NUL.
    fn hashed(&self) -> String {
        let mut parts: Vec<&str> = self.at_rules.iter().map(String::as_str).collect();
        if !self.selector.is_empty() {
            parts.push(&self.selector);
        }
        parts.join(&SEP.to_string())
    }

    /// The rule for `class` holding `declarations`, wrapped in its at-rules.
    fn rule(&self, class: &str, declarations: &str) -> String {
        let mut text = format!(".{class}{}{{{declarations}}}", self.selector);
        for at_rule in self.at_rules.iter().rev() {
            text = format!("{at_rule}{{{text}}}");
        }
        text
    }
}

/// One declaration of the merged css.
#[derive(Debug, Clone)]
struct Declaration {
    context: Context,
    /// Keys from the top of the merged css to the object holding it.
    path: Vec<String>,
    key: String,
    property: String,
    route: Route,
}

/// A nested selector that is not a plain pseudo-class or pseudo-element of the
/// element itself: written as one per-node rule, or left whole to the runtime.
#[derive(Debug, Clone)]
struct Block {
    /// Keys from the top of the merged css to the object holding it, and its own key.
    path: Vec<String>,
    key: String,
    /// The selector with `&` standing for the node's class.
    selector: String,
    at_rules: Vec<String>,
    declarations: Vec<(String, Route)>,
    children: Vec<Block>,
    /// Whether every entry inside can be written at build time.
    extractable: bool,
}

/// An object literal's entries as JavaScript evaluates it: in first-key order,
/// each holding its last value. `None` when a spread, a computed key or an
/// accessor makes the keys unknowable.
fn object_entries(obj: &ObjectLit) -> Option<Vec<(String, Expr)>> {
    let mut entries: Vec<(String, Expr)> = Vec::new();
    for prop in &obj.props {
        let PropOrSpread::Prop(prop) = prop else {
            return None;
        };
        let (key, value) = match &**prop {
            Prop::KeyValue(kv) => {
                if matches!(kv.key, PropName::Computed(_) | PropName::BigInt(_)) {
                    return None;
                }
                (key_name_atom(&kv.key).to_string(), (*kv.value).clone())
            }
            Prop::Shorthand(id) => (id.sym.to_string(), Expr::Ident(id.clone())),
            _ => return None,
        };
        match entries.iter_mut().find(|(k, _)| *k == key) {
            Some(slot) => slot.1 = value,
            None => entries.push((key, value)),
        }
    }
    Some(entries)
}

/// The suffix a simple pseudo selector key (`&:hover`, `&::before`,
/// `&:not(:last-child)`) adds after the element's class, or `None` for any other
/// selector.
fn pseudo_suffix(key: &str) -> Option<String> {
    let rest = key.strip_prefix('&')?;
    if rest.is_empty() || !rest.starts_with(':') {
        return None;
    }
    if rest.contains("::plac") || rest.contains(":read-") {
        return None;
    }
    let mut depth = 0i32;
    for ch in rest.chars() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return None;
                }
            }
            _ if depth > 0 => {
                if matches!(ch, '{' | '}' | ';' | '&' | '\\' | '"' | '\'') {
                    return None;
                }
            }
            _ if ch.is_ascii_alphanumeric() || ch == '-' || ch == ':' => {}
            _ => return None,
        }
    }
    (depth == 0).then(|| rest.to_string())
}

/// An at-rule key the static path writes as it is: `@media`, `@supports` or
/// `@container`, with no token and nothing that would break out of the rule.
fn at_rule_text(key: &str) -> Option<String> {
    let known = ["@media", "@supports", "@container"].iter().any(|k| {
        key.strip_prefix(k)
            .is_some_and(|rest| rest.starts_with([' ', '(']))
    });
    if !known
        || key.contains("theme.")
        || key.contains(['{', '}', ';', '&', '\\'])
        || key.contains("/*")
    {
        return None;
    }
    Some(key.split_whitespace().collect::<Vec<_>>().join(" "))
}

/// A selector key valid inside a per-node rule: no braces, semicolons,
/// backslashes or comments, and nothing the prefixer rewrites.
fn arbitrary_selector(key: &str) -> Option<String> {
    if key.contains(['{', '}', ';', '\\'])
        || key.contains("/*")
        || key.contains("::plac")
        || key.contains(":read-")
        || key.contains("theme.")
    {
        return None;
    }
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

/// Top-level commas of a selector, outside parentheses and brackets.
fn split_selector_list(selector: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut current = String::new();
    for ch in selector.chars() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(current.trim().to_string());
                current.clear();
                continue;
            }
            _ => {}
        }
        current.push(ch);
    }
    parts.push(current.trim().to_string());
    parts
}

/// `child` nested under `parent`, as stylis composes them: `&` replaced, and a
/// selector without one taken as a descendant.
fn compose_selector(parent: &str, child: &str) -> String {
    let mut out = Vec::new();
    for p in split_selector_list(parent) {
        for c in split_selector_list(child) {
            out.push(if c.contains('&') {
                c.replace('&', &p)
            } else {
                format!("{p} {c}")
            });
        }
    }
    out.join(",")
}

/// The merged css of one node.
struct Model {
    declarations: Vec<Declaration>,
    blocks: Vec<Block>,
    /// Top-level keys present in the merged css, whatever their value.
    keys: Vec<String>,
    /// Final base values of the keys [`DEFAULT_KEYS`] names.
    base_values: HashMap<String, Route>,
}

impl ModuleScope {
    fn model(&self, entries: Vec<(String, Expr)>) -> Option<Model> {
        let mut model = Model {
            declarations: Vec::new(),
            blocks: Vec::new(),
            keys: entries.iter().map(|(k, _)| k.clone()).collect(),
            base_values: HashMap::new(),
        };
        self.collect_object(&entries, &Context::base(), &[], &mut model)?;
        Some(model)
    }

    /// Walks one object of the merged css in `context`. `None` when the node
    /// cannot be extracted at all.
    fn collect_object(
        &self,
        entries: &[(String, Expr)],
        context: &Context,
        path: &[String],
        model: &mut Model,
    ) -> Option<()> {
        for (key, value) in entries {
            if RESERVED_STYLE_KEYS.contains(&key.as_str()) {
                return None;
            }
            let nested = matches!(unwrap_transparent(value), Expr::Object(_));
            if key.starts_with('@') {
                let Expr::Object(obj) = unwrap_transparent(value) else {
                    return None;
                };
                let inner = object_entries(obj)?;
                let text = at_rule_text(key)?;
                let mut child = context.clone();
                child.at_rules.push(text);
                self.collect_object(&inner, &child, &extend(path, key), model)?;
            } else if key.starts_with('&') || nested {
                let Expr::Object(obj) = unwrap_transparent(value) else {
                    return None;
                };
                match pseudo_suffix(key) {
                    Some(suffix) if !context.selector.contains("::") => {
                        let inner = object_entries(obj)?;
                        let mut child = context.clone();
                        child.selector.push_str(&suffix);
                        self.collect_object(&inner, &child, &extend(path, key), model)?;
                    }
                    _ => {
                        let parent = format!("&{}", context.selector);
                        let mut block = self.block(key, &parent, &context.at_rules, obj);
                        block.path = path.to_vec();
                        block.key = key.clone();
                        model.blocks.push(block);
                    }
                }
            } else {
                let route = checked(key, self.route(value, 0));
                if context.is_base() && DEFAULT_KEYS.contains(&key.as_str()) {
                    model.base_values.insert(key.clone(), route.clone());
                }
                if key.contains("theme.")
                    || key.starts_with(|c: char| !c.is_ascii_alphabetic() && c != '-')
                {
                    return None;
                }
                model.declarations.push(Declaration {
                    context: context.clone(),
                    path: path.to_vec(),
                    key: key.clone(),
                    property: property_name(key),
                    route,
                });
            }
        }
        Some(())
    }

    /// A per-node block for the selector `key` nested under `parent`.
    fn block(&self, key: &str, parent: &str, at_rules: &[String], obj: &ObjectLit) -> Block {
        let mut block = Block {
            path: Vec::new(),
            key: String::new(),
            selector: String::new(),
            at_rules: at_rules.to_vec(),
            declarations: Vec::new(),
            children: Vec::new(),
            extractable: true,
        };
        let (Some(selector), Some(entries)) = (arbitrary_selector(key), object_entries(obj)) else {
            block.extractable = false;
            return block;
        };
        block.selector = compose_selector(parent, &selector);
        for (child_key, value) in &entries {
            let nested = matches!(unwrap_transparent(value), Expr::Object(_));
            if RESERVED_STYLE_KEYS.contains(&child_key.as_str()) || child_key.contains("theme.") {
                block.extractable = false;
            } else if child_key.starts_with('@') {
                match (at_rule_text(child_key), unwrap_transparent(value)) {
                    (Some(text), Expr::Object(inner)) => {
                        let mut rules = at_rules.to_vec();
                        rules.push(text);
                        let child = self.block("&", &block.selector, &rules, inner);
                        block.extractable &= child.extractable;
                        block.children.push(child);
                    }
                    _ => block.extractable = false,
                }
            } else if child_key.starts_with('&') || nested {
                match unwrap_transparent(value) {
                    Expr::Object(inner) => {
                        let child = self.block(child_key, &block.selector, at_rules, inner);
                        block.extractable &= child.extractable;
                        block.children.push(child);
                    }
                    _ => block.extractable = false,
                }
            } else {
                let route = checked(child_key, self.route(value, 0));
                if !matches!(route, Route::Static(_) | Route::Omit) {
                    block.extractable = false;
                }
                block.declarations.push((child_key.clone(), route));
            }
        }
        block
    }
}

impl Block {
    /// Every property set inside, for overlap with the element's own rules.
    fn properties(&self, out: &mut Vec<String>) {
        for (key, _) in &self.declarations {
            out.push(property_name(key));
        }
        for child in &self.children {
            child.properties(out);
        }
    }

    /// The rules, Emotion's order: own declarations, then nested rules in
    /// source order. `&` in the selector stands for the node's class.
    fn rules(&self, out: &mut String) -> Option<()> {
        let mut declarations = String::new();
        for (key, route) in &self.declarations {
            if let Route::Static(value) = route {
                declarations.push_str(&stylis::declarations(
                    &property_name(key),
                    &value_text(key, value)?,
                )?);
            }
        }
        if !declarations.is_empty() {
            let mut text = format!("{}{{{declarations}}}", self.selector);
            for at_rule in self.at_rules.iter().rev() {
                text = format!("{at_rule}{{{text}}}");
            }
            out.push_str(&text);
        }
        for child in &self.children {
            child.rules(out)?;
        }
        Some(())
    }
}

// ---------------------------------------------------------------------------
// Deciding what is extracted

/// Moves declarations to the runtime path until every rule in the module docs
/// holds. Returns whether anything is left on the runtime path.
fn settle(model: &mut Model) -> bool {
    loop {
        let mut changed = false;
        let mut to_runtime: HashSet<usize> = HashSet::new();
        let decls = &model.declarations;

        // Prefixed VAR values: the prefixer's output depends on the value.
        for (i, d) in decls.iter().enumerate() {
            if matches!(d.route, Route::Var(_)) && stylis::is_prefixed_property(&d.property) {
                to_runtime.insert(i);
            }
        }

        for (i, a) in decls.iter().enumerate() {
            if !a.route.is_static_path() {
                continue;
            }
            for (j, b) in decls.iter().enumerate() {
                if i == j || !overlaps(&a.property, &b.property) {
                    continue;
                }
                if !b.route.is_static_path() && !matches!(b.route, Route::Omit) {
                    // Rule: never split a property between the two paths.
                    to_runtime.insert(i);
                } else if b.route.is_static_path() {
                    let same_context = a.context == b.context;
                    let both_nested = !a.context.is_base() && !b.context.is_base();
                    if same_context || both_nested {
                        // Order-dependent: atomic rules cannot keep it.
                        to_runtime.insert(i);
                        to_runtime.insert(j);
                    }
                }
            }
        }

        // A per-node block that can share a property with the element's own
        // pseudo rules depends on source order against them.
        let pseudo_properties: Vec<&str> = decls
            .iter()
            .filter(|d| d.route.is_static_path() && !d.context.selector.is_empty())
            .map(|d| d.property.as_str())
            .collect();
        let any_block_runtime = model.blocks.iter().any(|b| !b.extractable);
        for block in model.blocks.iter_mut() {
            if !block.extractable {
                continue;
            }
            let mut properties = Vec::new();
            block.properties(&mut properties);
            let clashes = properties
                .iter()
                .any(|p| pseudo_properties.iter().any(|q| overlaps(p, q)))
                || properties.iter().any(|p| {
                    decls.iter().any(|d| {
                        matches!(d.route, Route::Runtime)
                            && !d.context.selector.is_empty()
                            && overlaps(p, &d.property)
                    })
                });
            if clashes || any_block_runtime {
                block.extractable = false;
                changed = true;
            }
        }

        let partial = model
            .declarations
            .iter()
            .any(|d| matches!(d.route, Route::Runtime))
            || model.blocks.iter().any(|b| !b.extractable)
            || model
                .base_values
                .values()
                .any(|r| !matches!(r, Route::Static(_) | Route::Omit));
        if partial {
            for (i, d) in model.declarations.iter().enumerate() {
                if d.route.is_static_path()
                    && DEFAULT_KEYS
                        .iter()
                        .any(|k| overlaps(&d.property, &property_name(k)))
                {
                    to_runtime.insert(i);
                }
            }
        }

        for i in to_runtime {
            if model.declarations[i].route.is_static_path() {
                model.declarations[i].route = Route::Runtime;
                changed = true;
            }
        }
        if !changed {
            return partial;
        }
    }
}

// ---------------------------------------------------------------------------
// Defaults

/// `ThemeUtil.parseFlexShorthand`'s shrink, or `None` where it returns null.
fn flex_shrink_of(flex: &Value) -> Option<f64> {
    use regex_lite::Regex;
    use std::sync::LazyLock;
    static FACTOR: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^\+?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$").expect("valid"));
    static BASIS: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^(auto|content|max-content|min-content|fit-content|[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([a-z]+|%)|(calc|min|max|clamp|fit-content)\(.*\))$").expect("valid")
    });
    match flex {
        Value::Num(n) => (*n >= 0.0).then_some(1.0),
        Value::Str(s) => {
            let normalized = s.trim().to_lowercase();
            match normalized.as_str() {
                "" => None,
                "none" => Some(0.0),
                "auto" | "initial" => Some(1.0),
                _ => {
                    let mut tokens = Vec::new();
                    let mut depth = 0i32;
                    let mut current = String::new();
                    for ch in normalized.chars() {
                        if ch == '(' {
                            depth += 1;
                        } else if ch == ')' {
                            depth -= 1;
                            if depth < 0 {
                                return None;
                            }
                        }
                        if depth == 0 && ch.is_whitespace() {
                            if !current.is_empty() {
                                tokens.push(std::mem::take(&mut current));
                            }
                        } else {
                            current.push(ch);
                        }
                    }
                    if depth != 0 {
                        return None;
                    }
                    if !current.is_empty() {
                        tokens.push(current);
                    }
                    if tokens.is_empty() || tokens.len() > 3 {
                        return None;
                    }
                    let kinds: Option<String> = tokens
                        .iter()
                        .map(|t| {
                            if FACTOR.is_match(t) {
                                Some('n')
                            } else if BASIS.is_match(t) {
                                Some('b')
                            } else {
                                None
                            }
                        })
                        .collect();
                    let number = |t: &str| t.trim_start_matches('+').parse::<f64>().ok();
                    match kinds?.as_str() {
                        "n" | "b" | "nb" | "bn" => Some(1.0),
                        "nn" | "nnb" => number(&tokens[1]),
                        "nnn" => (number(&tokens[2]) == Some(0.0))
                            .then(|| number(&tokens[1]))
                            .flatten(),
                        "bnn" => number(&tokens[2]),
                        _ => None,
                    }
                }
            }
        }
    }
}

/// `resolveDefaultStyle`'s base declarations for a node whose base values are
/// all known, as `(key, value)` in the order it writes them. `None` when a value
/// it reads is not one this port follows.
fn defaults(model: &Model) -> Option<Vec<(&'static str, Value)>> {
    let get = |key: &str| -> Option<Option<Value>> {
        match model.base_values.get(key) {
            None | Some(Route::Omit) => Some(None),
            Some(Route::Static(v)) => Some(Some(v.clone())),
            _ => None,
        }
    };
    let present = |key: &str| model.keys.iter().any(|k| k == key);
    let as_str = |v: &Option<Value>| match v {
        Some(Value::Str(s)) => Some(s.clone()),
        _ => None,
    };
    let truthy = |v: &Option<Value>| match v {
        None => false,
        Some(Value::Str(s)) => !s.is_empty(),
        Some(Value::Num(n)) => *n != 0.0 && !n.is_nan(),
    };

    let display = as_str(&get("display")?);
    let is_flex_container = matches!(display.as_deref(), Some("flex" | "inline-flex"));
    let has_overflow =
        truthy(&get("overflow")?) || truthy(&get("overflowY")?) || truthy(&get("overflowX")?);
    let flex_flow = get("flexFlow")?;
    if matches!(flex_flow, Some(Value::Num(_))) {
        return None;
    }
    let flex_wrap = as_str(&get("flexWrap")?);
    let is_wrapping = as_str(&flex_flow).is_some_and(|f| f.contains("wrap"))
        || matches!(flex_wrap.as_deref(), Some("wrap" | "wrap-reverse"));
    let explicit_shrink = get("flexShrink")?.is_some();
    let flex = get("flex")?;
    let has_flex_shorthand = match &flex {
        None => false,
        Some(Value::Str(s)) => !s.is_empty(),
        Some(Value::Num(_)) => true,
    };
    let direction = as_str(&get("flexDirection")?);

    let mut shrink: Option<f64> = None;
    if !explicit_shrink {
        if has_flex_shorthand {
            shrink = flex.as_ref().and_then(flex_shrink_of);
        } else if is_flex_container {
            if !has_overflow {
                let column = matches!(direction.as_deref(), Some("column" | "column-reverse"));
                let row = matches!(direction.as_deref(), Some("row" | "row-reverse"))
                    || direction.is_none();
                if (column || row) && !is_wrapping {
                    shrink = Some(0.0);
                }
            }
        } else {
            shrink = Some(0.0);
        }
    }

    // `{ flex, flexShrink, minHeight: 0, minWidth: 0, ...rest }`: a key the
    // author wrote replaces the default, even with `undefined`.
    let mut out = Vec::new();
    if !present("flexShrink")
        && let Some(s) = shrink
    {
        out.push(("flexShrink", Value::Num(s)));
    }
    if !present("minHeight") {
        out.push(("minHeight", Value::Num(0.0)));
    }
    if !present("minWidth") {
        out.push(("minWidth", Value::Num(0.0)));
    }
    Some(out)
}

// ---------------------------------------------------------------------------
// Output

/// What a call site's rewrite adds and removes.
pub struct SiteExtraction {
    /// The `__meo$s` and, when any VAR, `__meo$v` props.
    pub props: Vec<PropOrSpread>,
    /// Top-level keys taken out of `__meo$c` and `css`.
    pub removed_top_keys: HashSet<String>,
}

fn str_expr(text: &str) -> Expr {
    Expr::Lit(Lit::Str(Str::from(Atom::from(text))))
}

/// The class string of one SWITCH route: `test ? ' a' : ' b'`, nested as written.
fn switch_expr(route: &Route, class_of: &mut dyn FnMut(&Value) -> Option<String>) -> Option<Expr> {
    match route {
        Route::Omit => Some(str_expr("")),
        Route::Static(v) => Some(str_expr(&format!(" {}", class_of(v)?))),
        Route::Switch(test, cons, alt) => Some(Expr::Cond(CondExpr {
            span: DUMMY_SP,
            test: test.clone(),
            cons: Box::new(switch_expr(cons, class_of)?),
            alt: Box::new(switch_expr(alt, class_of)?),
        })),
        _ => None,
    }
}

fn paren(expr: Expr) -> Expr {
    Expr::Paren(ParenExpr {
        span: DUMMY_SP,
        expr: Box::new(expr),
    })
}

/// An atomic rule for `property: text` in `context`, or `None` when stylis's
/// parse of the value is not one this port follows.
fn atomic_rule(context: &Context, property: &str, text: &str) -> Option<Rule> {
    let declarations = stylis::declarations(property, text)?;
    let minified = stylis::minify_value(text)?;
    let class = class_name(&format!(
        "{}{SEP}{property}{SEP}{minified}",
        context.hashed()
    ));
    let rule_text = context.rule(&class, &declarations);
    Some(Rule {
        bucket: context.bucket(),
        class,
        text: rule_text,
    })
}

impl ModuleScope {
    /// Extracts what it can from one host call site's style. `c_props` is the
    /// call site's `__meo$c` bucket and `special_props` its top-level special
    /// props, both after the token rewrite. Returns `None`, touching nothing,
    /// when nothing is extracted.
    pub fn extract_site(
        &self,
        c_props: &mut Vec<PropOrSpread>,
        special_props: &mut Vec<PropOrSpread>,
        d_props: &[PropOrSpread],
        module: &mut ModuleExtraction,
    ) -> Option<SiteExtraction> {
        for prop in special_props.iter().chain(d_props.iter()) {
            let PropOrSpread::Prop(prop) = prop else {
                return None;
            };
            let name = match &**prop {
                Prop::KeyValue(kv) => key_name_atom(&kv.key).to_string(),
                Prop::Shorthand(id) => id.sym.to_string(),
                _ => return None,
            };
            if BLOCKING_PROPS.contains(&name.as_str()) {
                return None;
            }
        }

        // `{ ...c, ...css }`, as `_processCompiledProps` merges them.
        let mut entries = object_entries(&ObjectLit {
            span: DUMMY_SP,
            props: c_props.clone(),
        })?;
        let css_index = special_props
            .iter()
            .position(|p| prop_key(p).as_deref() == Some("css"));
        if let Some(index) = css_index {
            let PropOrSpread::Prop(prop) = &special_props[index] else {
                return None;
            };
            let value = match &**prop {
                Prop::KeyValue(kv) => (*kv.value).clone(),
                Prop::Shorthand(id) => Expr::Ident(id.clone()),
                _ => return None,
            };
            match unwrap_transparent(&value) {
                Expr::Object(obj) => {
                    for (key, value) in object_entries(obj)? {
                        match entries.iter_mut().find(|(k, _)| *k == key) {
                            Some(slot) => slot.1 = value,
                            None => entries.push((key, value)),
                        }
                    }
                }
                Expr::Lit(Lit::Bool(Bool { value: false, .. }) | Lit::Null(_)) => {}
                Expr::Ident(id) if id.sym.as_ref() == "undefined" => {}
                _ => return None,
            }
        }
        if entries.is_empty() {
            return None;
        }

        let mut model = self.model(entries)?;
        let partial = settle(&mut model);

        let mut classes: Vec<String> = Vec::new();
        let mut switches: Vec<Expr> = Vec::new();
        let mut variables: Vec<PropOrSpread> = Vec::new();
        let mut extracted: Vec<usize> = Vec::new();

        for (i, d) in model.declarations.iter().enumerate() {
            match &d.route {
                Route::Static(value) => {
                    let Some(rule) = value_text(&d.key, value)
                        .and_then(|text| atomic_rule(&d.context, &d.property, &text))
                    else {
                        continue;
                    };
                    classes.push(rule.class.clone());
                    module.add(rule);
                    extracted.push(i);
                }
                Route::Omit if !partial => extracted.push(i),
                Route::Omit => {}
                Route::Switch(..) => {
                    let mut rules = Vec::new();
                    let mut class_of = |v: &Value| {
                        let rule = value_text(&d.key, v)
                            .and_then(|text| atomic_rule(&d.context, &d.property, &text))?;
                        let class = rule.class.clone();
                        rules.push(rule);
                        Some(class)
                    };
                    if let Some(expr) = switch_expr(&d.route, &mut class_of) {
                        for rule in rules {
                            module.add(rule);
                        }
                        switches.push(paren(expr));
                        extracted.push(i);
                    }
                }
                Route::Var(expr) => {
                    let variable = format!(
                        "{VARIABLE_PREFIX}{}",
                        hash_styles(&format!("{}{SEP}{}", d.context.hashed(), d.property))
                    );
                    let Some(rule) =
                        atomic_rule(&d.context, &d.property, &format!("var({variable})"))
                    else {
                        continue;
                    };
                    classes.push(rule.class.clone());
                    module.add(rule);
                    module.uses_value = true;
                    variables.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                        key: PropName::Str(Str::from(Atom::from(variable.as_str()))),
                        value: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            ctxt: SyntaxContext::empty(),
                            callee: Callee::Expr(Box::new(Expr::Ident(Ident::new_no_ctxt(
                                Atom::from(VALUE_LOCAL),
                                DUMMY_SP,
                            )))),
                            args: vec![
                                ExprOrSpread {
                                    spread: None,
                                    expr: Box::new(str_expr(&d.key)),
                                },
                                ExprOrSpread {
                                    spread: None,
                                    expr: expr.clone(),
                                },
                            ],
                            type_args: None,
                        })),
                    }))));
                    extracted.push(i);
                }
                Route::Runtime => {}
            }
        }

        let mut per_node_text = String::new();
        for block in model.blocks.iter().filter(|b| b.extractable) {
            block.rules(&mut per_node_text)?;
        }
        if !per_node_text.is_empty() {
            let placeholder_class = class_name(&per_node_text);
            let text = per_node_text.replace('&', &format!(".{placeholder_class}"));
            classes.push(placeholder_class.clone());
            module.add(Rule {
                bucket: BUCKET_PER_NODE,
                class: placeholder_class,
                text,
            });
        }

        if !partial {
            for (key, value) in defaults(&model)? {
                let text = value_text(key, &value)?;
                let rule = atomic_rule(&Context::base(), &property_name(key), &text)?;
                classes.push(rule.class.clone());
                module.add(rule);
            }
        }

        if classes.is_empty() && switches.is_empty() {
            return None;
        }

        // Remove what was extracted from `__meo$c` and `css`.
        let mut plan = Plan::default();
        for &i in &extracted {
            let d = &model.declarations[i];
            plan.remove(&d.path, &d.key);
        }
        for block in model.blocks.iter().filter(|b| b.extractable) {
            plan.remove(&block.path, &block.key);
        }
        let top: HashSet<String> = plan.top.clone();
        c_props.retain(|p| prop_key(p).is_none_or(|k| !top.contains(&k)));
        if let Some(index) = css_index {
            let mut drop_css = false;
            if let PropOrSpread::Prop(prop) = &mut special_props[index]
                && let Prop::KeyValue(kv) = &mut **prop
                && let Expr::Object(obj) = unwrap_parens_mut(&mut kv.value)
            {
                plan.apply(obj);
                drop_css = obj.props.is_empty();
            }
            if drop_css {
                special_props.remove(index);
            }
        }

        let mut class_expr = str_expr(&classes.join(" "));
        for switch in switches {
            class_expr = Expr::Bin(BinExpr {
                span: DUMMY_SP,
                op: BinaryOp::Add,
                left: Box::new(class_expr),
                right: Box::new(switch),
            });
        }
        let mut props = vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(IdentName::new(Atom::from(CLASSES_KEY), DUMMY_SP)),
            value: Box::new(class_expr),
        })))];
        if !variables.is_empty() {
            props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(IdentName::new(Atom::from(VARIABLES_KEY), DUMMY_SP)),
                value: Box::new(Expr::Object(ObjectLit {
                    span: DUMMY_SP,
                    props: variables,
                })),
            }))));
        }
        Some(SiteExtraction {
            props,
            removed_top_keys: top,
        })
    }
}

fn unwrap_parens_mut(mut expr: &mut Expr) -> &mut Expr {
    while let Expr::Paren(p) = expr {
        expr = &mut p.expr;
    }
    expr
}

fn prop_key(prop: &PropOrSpread) -> Option<String> {
    let PropOrSpread::Prop(prop) = prop else {
        return None;
    };
    match &**prop {
        Prop::KeyValue(kv) => Some(key_name_atom(&kv.key).to_string()),
        Prop::Shorthand(id) => Some(id.sym.to_string()),
        _ => None,
    }
}

/// Keys to take out of the css object, by path.
#[derive(Default)]
struct Plan {
    top: HashSet<String>,
    nested: HashMap<String, Plan>,
}

impl Plan {
    fn remove(&mut self, path: &[String], key: &str) {
        match path.split_first() {
            None => {
                self.top.insert(key.to_string());
            }
            Some((head, rest)) => self
                .nested
                .entry(head.clone())
                .or_default()
                .remove(rest, key),
        }
    }

    /// Applies the plan to `obj`: removes every occurrence of a removed key,
    /// recurses into the last occurrence of a nested one and drops earlier
    /// ones (dead, but they would resurface), and drops an object left empty.
    fn apply(&self, obj: &mut ObjectLit) {
        let keys: Vec<Option<String>> = obj.props.iter().map(prop_key).collect();
        let mut last: HashMap<String, usize> = HashMap::new();
        for (i, key) in keys.iter().enumerate() {
            if let Some(k) = key {
                last.insert(k.clone(), i);
            }
        }
        let mut keep = vec![true; obj.props.len()];
        for (i, key) in keys.iter().enumerate() {
            let Some(k) = key else { continue };
            if self.top.contains(k) {
                keep[i] = false;
            } else if let Some(child) = self.nested.get(k) {
                if last.get(k) != Some(&i) {
                    keep[i] = false;
                    continue;
                }
                if let PropOrSpread::Prop(prop) = &mut obj.props[i]
                    && let Prop::KeyValue(kv) = &mut **prop
                    && let Expr::Object(inner) = unwrap_parens_mut(&mut kv.value)
                {
                    child.apply(inner);
                    if inner.props.is_empty() {
                        keep[i] = false;
                    }
                }
            }
        }
        let mut index = 0;
        obj.props.retain(|_| {
            let k = keep[index];
            index += 1;
            k
        });
    }
}

/// Prepends the helper imports and the registration call to `module`.
pub fn emit_module(module: &mut Module, extraction: &ModuleExtraction) {
    if extraction.is_empty() {
        return;
    }
    let mut specifiers = Vec::new();
    if !extraction.rules.is_empty() {
        specifiers.push(named_import(REGISTER_EXPORT, REGISTER_LOCAL));
    }
    if extraction.uses_value {
        specifiers.push(named_import(VALUE_EXPORT, VALUE_LOCAL));
    }
    let import = ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
        span: DUMMY_SP,
        specifiers,
        src: Box::new(Str::from(Atom::from(UI_MODULE))),
        type_only: false,
        with: None,
        phase: ImportPhase::Evaluation,
    }));

    let mut items = vec![import];
    if !extraction.rules.is_empty() {
        let list: String = extraction
            .rules
            .iter()
            .map(|r| format!("{}{SEP}{}{SEP}{}\n", r.bucket, r.class, r.text))
            .collect();
        let module_id = hash_styles(&list);
        let rules = extraction
            .rules
            .iter()
            .map(|r| {
                Some(ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Array(ArrayLit {
                        span: DUMMY_SP,
                        elems: vec![
                            Some(ExprOrSpread {
                                spread: None,
                                expr: Box::new(Expr::Lit(Lit::Num(Number {
                                    span: DUMMY_SP,
                                    value: f64::from(r.bucket),
                                    raw: None,
                                }))),
                            }),
                            Some(ExprOrSpread {
                                spread: None,
                                expr: Box::new(str_expr(&r.class)),
                            }),
                            Some(ExprOrSpread {
                                spread: None,
                                expr: Box::new(str_expr(&r.text)),
                            }),
                        ],
                    })),
                })
            })
            .collect();
        items.push(ModuleItem::Stmt(Stmt::Expr(ExprStmt {
            span: DUMMY_SP,
            expr: Box::new(Expr::Call(CallExpr {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                callee: Callee::Expr(Box::new(Expr::Ident(Ident::new_no_ctxt(
                    Atom::from(REGISTER_LOCAL),
                    DUMMY_SP,
                )))),
                args: vec![
                    ExprOrSpread {
                        spread: None,
                        expr: Box::new(str_expr(&module_id)),
                    },
                    ExprOrSpread {
                        spread: None,
                        expr: Box::new(Expr::Array(ArrayLit {
                            span: DUMMY_SP,
                            elems: rules,
                        })),
                    },
                ],
                type_args: None,
            })),
        })));
    }

    // After the last import, so the call runs before any code below it.
    let at = module
        .body
        .iter()
        .rposition(|item| matches!(item, ModuleItem::ModuleDecl(ModuleDecl::Import(_))))
        .map_or(0, |i| i + 1);
    let import = items.remove(0);
    module.body.insert(0, import);
    for (offset, item) in items.into_iter().enumerate() {
        module.body.insert(at + 1 + offset, item);
    }
}

fn named_import(exported: &str, local: &str) -> ImportSpecifier {
    ImportSpecifier::Named(ImportNamedSpecifier {
        span: DUMMY_SP,
        local: Ident::new_no_ctxt(Atom::from(local), DUMMY_SP),
        imported: Some(ModuleExportName::Ident(Ident::new_no_ctxt(
            Atom::from(exported),
            DUMMY_SP,
        ))),
        is_type_only: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlap_follows_shorthands_and_logical_sides() {
        let yes = [
            ("margin", "margin-top"),
            ("margin-inline-start", "margin-left"),
            ("inset", "top"),
            ("inset-inline", "left"),
            ("min-width", "min-inline-size"),
            ("font", "line-height"),
            ("gap", "row-gap"),
            ("place-items", "align-items"),
            ("border-color", "border-top-color"),
            ("border", "border-image-source"),
            ("flex-flow", "flex-wrap"),
            ("all", "color"),
            ("-webkit-mask", "mask-image"),
        ];
        for (a, b) in yes {
            assert!(overlaps(a, b), "{a} / {b}");
            assert!(overlaps(b, a), "{b} / {a}");
        }
        let no = [
            ("margin-top", "margin-left"),
            ("top", "left"),
            ("min-width", "min-height"),
            ("color", "background-color"),
            ("width", "max-width"),
            ("text-align", "text-decoration"),
        ];
        for (a, b) in no {
            assert!(!overlaps(a, b), "{a} / {b}");
        }
    }

    #[test]
    fn property_names_follow_emotion() {
        assert_eq!(property_name("backgroundColor"), "background-color");
        assert_eq!(property_name("msTransform"), "-ms-transform");
        assert_eq!(property_name("WebkitMask"), "-webkit-mask");
        assert_eq!(property_name("--gap"), "--gap");
        assert_eq!(property_name("line-height"), "line-height");
    }

    #[test]
    fn numbers_are_written_as_javascript_writes_them() {
        assert_eq!(js_number(16.0).as_deref(), Some("16"));
        assert_eq!(js_number(1.5).as_deref(), Some("1.5"));
        assert_eq!(js_number(-4.0).as_deref(), Some("-4"));
        assert_eq!(js_number(0.0).as_deref(), Some("0"));
        assert_eq!(js_number(1e-7), None);
        assert_eq!(js_number(f64::NAN), None);
    }

    #[test]
    fn px_follows_the_key_as_written() {
        assert_eq!(
            value_text("lineHeight", &Value::Num(1.5)).as_deref(),
            Some("1.5")
        );
        // Emotion looks `@emotion/unitless` up by the key as written.
        assert_eq!(
            value_text("line-height", &Value::Num(1.5)).as_deref(),
            Some("1.5px")
        );
        assert_eq!(
            value_text("padding", &Value::Num(0.0)).as_deref(),
            Some("0")
        );
        assert_eq!(value_text("--x", &Value::Num(4.0)).as_deref(), Some("4"));
    }

    #[test]
    fn flex_shrink_matches_parse_flex_shorthand() {
        let s = |v: &str| flex_shrink_of(&Value::Str(v.to_string()));
        assert_eq!(flex_shrink_of(&Value::Num(1.0)), Some(1.0));
        assert_eq!(flex_shrink_of(&Value::Num(-1.0)), None);
        assert_eq!(s("none"), Some(0.0));
        assert_eq!(s("auto"), Some(1.0));
        assert_eq!(s("1 0 auto"), Some(0.0));
        assert_eq!(s("2"), Some(1.0));
        assert_eq!(s("1 2"), Some(2.0));
        assert_eq!(s("1 1 0"), Some(1.0));
        assert_eq!(s("1 1 2"), None);
        assert_eq!(s("calc(1px + 2px)"), Some(1.0));
        assert_eq!(s("auto 2 3"), Some(3.0));
        assert_eq!(s("x"), None);
    }

    #[test]
    fn only_simple_pseudo_selectors_are_atomic_contexts() {
        assert_eq!(pseudo_suffix("&:hover").as_deref(), Some(":hover"));
        assert_eq!(pseudo_suffix("&::before").as_deref(), Some("::before"));
        assert_eq!(
            pseudo_suffix("&:not(:last-child)").as_deref(),
            Some(":not(:last-child)")
        );
        assert_eq!(
            pseudo_suffix("&:hover::after").as_deref(),
            Some(":hover::after")
        );
        for key in [
            "& pre",
            "&:hover, &:focus",
            "&::placeholder",
            "&:read-only",
            "&.active",
            "&[open]",
            "&",
        ] {
            assert_eq!(pseudo_suffix(key), None, "{key}");
        }
    }

    #[test]
    fn class_names_are_stable_and_shared_by_content() {
        // Pinned: a change here renames every extracted class in every app.
        let rule = atomic_rule(&Context::base(), "padding", "8px").expect("writable");
        assert_eq!(rule.class, "mn-350ngwob8xscz");
        assert_eq!(rule.text, ".mn-350ngwob8xscz{padding:8px;}");
        let hover = Context {
            at_rules: Vec::new(),
            selector: ":hover".into(),
        };
        assert_ne!(
            atomic_rule(&hover, "padding", "8px")
                .expect("writable")
                .class,
            rule.class
        );
        assert_eq!(hover.bucket(), BUCKET_PSEUDO);
    }

    /// `resolveDefaultStyle`'s output, written by `scripts/codegen-extract-tables.ts`.
    const DEFAULT_CASES: &str = include_str!("../tests/fixture/extract/defaults.json");

    #[test]
    fn defaults_match_resolve_default_style() {
        let cases: Vec<(
            serde_json::Map<String, serde_json::Value>,
            serde_json::Map<String, serde_json::Value>,
        )> = serde_json::from_str(DEFAULT_CASES).expect("fixture parses");
        assert!(cases.len() > 500);
        let mut mismatches = Vec::new();
        for (input, expected) in &cases {
            let mut model = Model {
                declarations: Vec::new(),
                blocks: Vec::new(),
                keys: Vec::new(),
                base_values: HashMap::new(),
            };
            for (key, value) in input {
                model.keys.push(key.clone());
                let route = match value {
                    serde_json::Value::Null => Route::Omit,
                    serde_json::Value::String(s) if s.is_empty() => Route::Omit,
                    serde_json::Value::String(s) => Route::Static(Value::Str(s.clone())),
                    serde_json::Value::Number(n) => {
                        Route::Static(Value::Num(n.as_f64().expect("finite")))
                    }
                    other => panic!("unexpected sample {other}"),
                };
                model.base_values.insert(key.clone(), route);
            }
            let got: Vec<(String, f64)> = defaults(&model)
                .expect("decidable")
                .into_iter()
                .map(|(k, v)| match v {
                    Value::Num(n) => (k.to_string(), n),
                    Value::Str(_) => panic!("defaults are numbers"),
                })
                .collect();
            let want: Vec<(String, f64)> = expected
                .iter()
                .map(|(k, v)| (k.clone(), v.as_f64().expect("number")))
                .collect();
            if got != want {
                mismatches.push(format!("{input:?}: got {got:?}, runtime {want:?}"));
            }
        }
        assert!(
            mismatches.is_empty(),
            "{} mismatches:\n{}",
            mismatches.len(),
            mismatches
                .iter()
                .take(20)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );
    }

    #[test]
    fn selectors_compose_as_stylis_composes_them() {
        assert_eq!(compose_selector("&", "& pre"), "& pre");
        assert_eq!(compose_selector("&", ".dark &"), ".dark &");
        assert_eq!(compose_selector("&", "pre, code"), "& pre,& code");
        assert_eq!(compose_selector("&:hover", "& svg"), "&:hover svg");
        assert_eq!(
            compose_selector("& a,& b", "&:hover"),
            "& a:hover,& b:hover"
        );
    }
}
