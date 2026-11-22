//! Build-time CSS extraction behind `experimental_extractCss`.
//!
//! For a host factory call site that `partition` is already rewriting, and
//! whose whole style is known at build time, the compiler computes the name
//! and serialized styles the runtime would give the node (see
//! `serialize.rs`), registers them once per module and puts the name on the
//! call site:
//!
//! ```text
//! __meoCss('<module id>', [['<name>', 'flex-shrink:0;…;padding:8px;'], …])
//! Div({ __meo$: 2, __meo$n: open ? '<name>' : '<other name>', … })
//! ```
//!
//! The runtime inserts the text through Emotion under that name, when the
//! node renders, so the node is the one Emotion would insert uncompiled: the
//! same class, rule and first insertion. Exactness rests on the text alone,
//! which the serialization differential (`tests/serialization-differential.test.ts`)
//! compares with the runtime's for every grammar case.
//!
//! A value is known when it is a literal, a token string or a same-file
//! `const` literal, at any depth; a conditional over known values gives one
//! name per combination, up to [`SWITCH_COMBINATIONS`]. A node holding
//! anything else stays whole on the runtime path, as it renders today.

use std::collections::{HashMap, HashSet};

use swc_core::common::{DUMMY_SP, EqIgnoreSpan, SyntaxContext};
use swc_core::ecma::ast::*;
use swc_core::ecma::atoms::Atom;

use crate::explain;
use crate::extract_tables::{
    InitialProps, InitialValue, is_host_factory, is_unitless, layout_factory,
};
use crate::keys::key_name_atom;
use crate::serialize::{self, Js};
use crate::style_name::hash_styles;
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
/// The call site's class name: the runtime's own name for its styles.
pub const NAME_KEY: &str = "__meo$n";
pub const VARIABLES_KEY: &str = "__meo$v";
/// On a layout factory's call site whose initial props were merged here: their
/// fingerprint, which tells a runtime with the same initial props to skip its
/// own merge.
pub const INITIAL_KEY: &str = "__meo$i";
/// Separator between the parts of a hashed context, as the contract names it.
const SEP: char = '\u{0}';

/// Top-level props whose presence changes how the runtime styles the node.
const BLOCKING_PROPS: &[&str] = &["disableEmotion", "as", "theme"];

/// The JavaScript numbers this writes as the runtime would: integers and plain
/// decimals. Outside this range `Number#toString` switches to exponent form.
const PLAIN_NUMBER_MIN: f64 = 1e-6;
const PLAIN_NUMBER_MAX: f64 = 1e21;

/// One rule for the module's registration call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    /// The runtime's name for the styles.
    pub class: String,
    /// Emotion's serialized styles, before stylis.
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
    /// Local bindings of layout factories imported from `@meonode/ui`.
    layout_factories: HashMap<(Atom, SyntaxContext), Factory>,
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
            } else if let Some((fingerprint, initial)) = layout_factory(imported.as_ref()) {
                self.layout_factories.insert(
                    key,
                    Factory::Layout {
                        fingerprint,
                        initial,
                    },
                );
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

    /// The factory `call` renders a host element through, when its styles can
    /// be extracted: an imported host or layout factory, or `Node` with a tag
    /// string.
    pub fn extractable_factory(&self, call: &CallExpr) -> Option<Factory> {
        let Callee::Expr(callee) = &call.callee else {
            return None;
        };
        let Expr::Ident(id) = &**callee else {
            return None;
        };
        let key = (id.sym.clone(), id.ctxt);
        if self.host_factories.contains(&key) {
            return Some(Factory::Host);
        }
        if let Some(factory) = self.layout_factories.get(&key) {
            return Some(*factory);
        }
        if self.node_factories.contains(&key) {
            let tag = call.args.first().is_some_and(|arg| {
                arg.spread.is_none()
                    && matches!(unwrap_transparent(&arg.expr), Expr::Lit(Lit::Str(s))
                        if s.value.as_str().is_some_and(|tag| tag.starts_with(|c: char| c.is_ascii_lowercase())))
            });
            return tag.then_some(Factory::Host);
        }
        None
    }
}

/// A factory whose call sites can be extracted.
#[derive(Debug, Clone, Copy)]
pub enum Factory {
    /// Declared with nothing but its tag.
    Host,
    /// Declared with flat initial props, which `createNode` merges in front of
    /// the call site's.
    Layout {
        fingerprint: &'static str,
        initial: InitialProps,
    },
}

impl Factory {
    fn initial_entries(&self) -> Vec<(String, Expr)> {
        match self {
            Factory::Host => Vec::new(),
            Factory::Layout { initial, .. } => initial
                .iter()
                .map(|(key, value)| (key.to_string(), initial_expr(*value)))
                .collect(),
        }
    }
}

fn initial_expr(value: InitialValue) -> Expr {
    match value {
        InitialValue::Str(s) => str_expr(s),
        InitialValue::Num(n) => Expr::Lit(Lit::Num(Number {
            span: DUMMY_SP,
            value: n,
            raw: None,
        })),
    }
}

/// `combineFactoryProps(initial, props)` for initial props without a `css`
/// (the only ones [`Factory::Layout`] holds): `{ ...initial, ...props }`, each
/// key where it first appears, holding its last value.
fn combine_factory_props(
    initial: &[(String, Expr)],
    props: &[(String, Expr)],
) -> Vec<(String, Expr)> {
    let mut combined = initial.to_vec();
    for (key, value) in props {
        match combined.iter_mut().find(|(k, _)| k == key) {
            Some(slot) => slot.1 = value.clone(),
            None => combined.push((key.clone(), value.clone())),
        }
    }
    combined
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

impl ModuleScope {
    /// Extracts what it can from one host call site's style. `c_props` is the
    /// call site's `__meo$c` bucket and `special_props` its top-level special
    /// props, both after the token rewrite. Returns `None`, touching nothing,
    /// when nothing is extracted.
    pub fn extract_site(
        &self,
        factory: Factory,
        c_props: &mut Vec<PropOrSpread>,
        special_props: &mut Vec<PropOrSpread>,
        d_props: &[PropOrSpread],
        module: &mut ModuleExtraction,
    ) -> Option<SiteExtraction> {
        for prop in special_props.iter().chain(d_props.iter()) {
            let PropOrSpread::Prop(prop) = prop else {
                return explain::bail("a spread among the props");
            };
            let name = match &**prop {
                Prop::KeyValue(kv) => key_name_atom(&kv.key).to_string(),
                Prop::Shorthand(id) => id.sym.to_string(),
                _ => return explain::bail("a prop that is not key: value"),
            };
            if BLOCKING_PROPS.contains(&name.as_str()) {
                return explain::bail("a prop that blocks extraction");
            }
        }

        // The factory's initial props merged in front of the call site's, as
        // `createNode` merges them, then `{ ...flat, ...css }`, as
        // `_processCompiledProps` merges those.
        let mut call_props = object_entries(&ObjectLit {
            span: DUMMY_SP,
            props: c_props.clone(),
        })
        .or_else(|| explain::bail("props with a spread or computed key"))?;
        let css_index = special_props
            .iter()
            .position(|p| prop_key(p).as_deref() == Some("css"));
        if let Some(index) = css_index {
            let PropOrSpread::Prop(prop) = &special_props[index] else {
                return explain::bail("a css prop that is not key: value");
            };
            let value = match &**prop {
                Prop::KeyValue(kv) => (*kv.value).clone(),
                Prop::Shorthand(id) => Expr::Ident(id.clone()),
                _ => return explain::bail("a css prop that is not key: value"),
            };
            call_props.push(("css".to_string(), value));
        }
        let initial = factory.initial_entries();
        let mut entries = combine_factory_props(&initial, &call_props);
        let css = entries
            .iter()
            .position(|(key, _)| key == "css")
            .map(|at| entries.remove(at).1);
        if let Some(value) = css {
            match unwrap_transparent(&value) {
                Expr::Object(obj) => {
                    for spread in obj.props.iter().filter_map(|p| p.as_spread()) {
                        explain::classify("css spread", &spread.expr);
                    }
                    for (key, value) in object_entries(obj)
                        .or_else(|| explain::bail("css with a spread or computed key"))?
                    {
                        match entries.iter_mut().find(|(k, _)| *k == key) {
                            Some(slot) => slot.1 = value,
                            None => entries.push((key, value)),
                        }
                    }
                }
                Expr::Lit(Lit::Bool(Bool { value: false, .. }) | Lit::Null(_)) => {}
                Expr::Ident(id) if id.sym.as_ref() == "undefined" => {}
                other => {
                    explain::classify("css", other);
                    return explain::bail("css that is not an object literal");
                }
            }
        }
        if entries.is_empty() {
            return explain::bail("no style entries");
        }

        // The object `renderOwnClass` serializes, one per SWITCH combination.
        // Every entry is looked at, so the reason recorder sees each value left
        // to the runtime, not only the first.
        let mut tree = Vec::new();
        let mut known = true;
        for (key, value) in &entries {
            match self.entry(key, value, 0) {
                Some(entry) => tree.push((key.clone(), entry)),
                None => known = false,
            }
        }
        if !known {
            return None;
        }
        // One name per combination of choices, stopping past the cap.
        let mut named: Vec<Rule> = Vec::new();
        let mut over_cap = false;
        let name_expr = name_expr(&tree, &mut |chosen| {
            if named.len() == SWITCH_COMBINATIONS {
                over_cap = true;
                return None;
            }
            let styles = styles_text(chosen)?;
            let name = serialize::style_name(&styles);
            named.push(Rule {
                class: name.clone(),
                text: styles,
            });
            Some(name)
        });
        if over_cap {
            return explain::bail("more SWITCH combinations than the cap");
        }
        let name_expr = name_expr?;
        for rule in named {
            module.add(rule);
        }

        // Every style entry is in the name: none is left for the runtime.
        let top: HashSet<String> = entries.iter().map(|(key, _)| key.clone()).collect();
        c_props.clear();
        if let Some(index) = css_index {
            special_props.remove(index);
        }
        let mut props = vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(IdentName::new(Atom::from(NAME_KEY), DUMMY_SP)),
            value: Box::new(name_expr),
        })))];
        if let Factory::Layout { fingerprint, .. } = factory {
            props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(IdentName::new(Atom::from(INITIAL_KEY), DUMMY_SP)),
                value: Box::new(str_expr(fingerprint)),
            }))));
        }
        Some(SiteExtraction {
            props,
            removed_top_keys: top,
        })
    }
}

/// The most names, one per SWITCH combination, a node is given at build time.
/// Past it, the node stays on the runtime path.
const SWITCH_COMBINATIONS: usize = 16;

/// One css entry as the runtime's object holds it, with SWITCH choices open.
#[derive(Debug, Clone)]
enum Entry {
    Value(Leaf),
    Object(Vec<(String, Entry)>),
}

/// A value, or a choice between values made by an expression at the call site.
#[derive(Debug, Clone)]
enum Leaf {
    Known(Js),
    Switch(Box<Expr>, Box<Leaf>, Box<Leaf>),
}

impl ModuleScope {
    /// `value` under `key` as an [`Entry`], or `None` when the node must stay
    /// whole on the runtime path.
    fn entry(&self, key: &str, value: &Expr, depth: u8) -> Option<Entry> {
        if key.contains("theme.") {
            return explain::bail("a theme token in a key");
        }
        if matches!(key, "styles" | "anim") {
            return explain::bail("a key Emotion reads as serialized styles or keyframes");
        }
        if serialize::is_index_key(key) {
            return explain::bail("a key JavaScript orders before the others");
        }
        if let Expr::Object(obj) = unwrap_transparent(value) {
            if depth > 32 {
                return explain::bail("css nested too deep");
            }
            let mut out = Vec::new();
            let mut known = true;
            for (k, v) in object_entries(obj)
                .or_else(|| explain::bail("an object with a spread or computed key"))?
            {
                match self.entry(&k, &v, depth + 1) {
                    Some(entry) => out.push((k, entry)),
                    None => known = false,
                }
            }
            return known.then_some(Entry::Object(out));
        }
        let leaf = self.leaf(value, 0).or_else(|| {
            explain::classify("value", value);
            explain::bail("a value left to the runtime")
        })?;
        Some(Entry::Value(leaf))
    }

    /// A value known at build time, or a SWITCH over such values.
    fn leaf(&self, expr: &Expr, depth: u8) -> Option<Leaf> {
        if depth > 8 {
            return None;
        }
        Some(Leaf::Known(match unwrap_transparent(expr) {
            Expr::Lit(Lit::Str(s)) => Js::Str(s.value.as_str()?.to_string()),
            Expr::Lit(Lit::Num(n)) => Js::Num(n.value),
            Expr::Lit(Lit::Bool(b)) => Js::Bool(b.value),
            Expr::Lit(Lit::Null(_)) => Js::Null,
            Expr::Tpl(tpl) if tpl.exprs.is_empty() => {
                Js::Str(tpl.quasis.first()?.cooked.as_ref()?.as_str()?.to_string())
            }
            Expr::Unary(UnaryExpr {
                op: UnaryOp::Minus,
                arg,
                ..
            }) => match unwrap_transparent(arg) {
                Expr::Lit(Lit::Num(n)) => Js::Num(-n.value),
                _ => return None,
            },
            Expr::Ident(id) if id.sym.as_ref() == "undefined" => Js::Undefined,
            Expr::Ident(id) => {
                let init = self.consts.get(&(id.sym.clone(), id.ctxt))?;
                return self.leaf(init, depth + 1);
            }
            Expr::Cond(c) if is_pure_read(&c.test) => {
                return Some(Leaf::Switch(
                    c.test.clone(),
                    Box::new(self.leaf(&c.cons, depth + 1)?),
                    Box::new(self.leaf(&c.alt, depth + 1)?),
                ));
            }
            // `a && b` with `a` a boolean is `b` or `false`.
            Expr::Bin(b)
                if b.op == BinaryOp::LogicalAnd && is_boolean(&b.left) && is_pure_read(&b.left) =>
            {
                return Some(Leaf::Switch(
                    b.left.clone(),
                    Box::new(self.leaf(&b.right, depth + 1)?),
                    Box::new(Leaf::Known(Js::Bool(false))),
                ));
            }
            _ => return None,
        }))
    }
}

/// Names one fully chosen css object, or `None` to stop.
type NameOf<'a> = dyn FnMut(&[(String, Js)]) -> Option<String> + 'a;

/// SWITCH tests already decided on the way to a combination, with their branch.
type Decided = Vec<(Box<Expr>, bool)>;

/// The class-name expression for `tree`: each SWITCH becomes a conditional
/// choosing between the names of the objects its branches give. `name_of`
/// names one fully chosen object.
fn name_expr(tree: &[(String, Entry)], name_of: &mut NameOf<'_>) -> Option<Expr> {
    let mut leaves = Vec::new();
    flatten(tree, &mut Vec::new(), &mut leaves);
    choose(&leaves, &mut Vec::new(), &mut Vec::new(), name_of)
}

/// Each leaf of `tree` with its key path, in JavaScript's key order. An empty
/// object is a leaf of its own, since Emotion still writes its braces.
fn flatten(tree: &[(String, Entry)], path: &mut Vec<String>, out: &mut Vec<(Vec<String>, Leaf)>) {
    for (key, entry) in tree {
        path.push(key.clone());
        match entry {
            Entry::Value(leaf) => out.push((path.clone(), leaf.clone())),
            Entry::Object(inner) if inner.is_empty() => {
                out.push((path.clone(), Leaf::Known(Js::Object(Vec::new()))));
            }
            Entry::Object(inner) => flatten(inner, path, out),
        }
        path.pop();
    }
}

/// The conditional over `leaves[chosen.len()..]`'s choices, each complete
/// choice named by `name_of`. A test already decided on the way down, written
/// the same, takes the same branch: a pure read gives one value per render.
fn choose(
    leaves: &[(Vec<String>, Leaf)],
    chosen: &mut Vec<Js>,
    decided: &mut Decided,
    name_of: &mut NameOf<'_>,
) -> Option<Expr> {
    let Some((_, leaf)) = leaves.get(chosen.len()) else {
        let mut obj = Vec::new();
        for ((path, _), value) in leaves.iter().zip(chosen.iter()) {
            set_path(&mut obj, path, value.clone());
        }
        return Some(str_expr(&name_of(&obj)?));
    };
    leaf_expr(leaf, decided, &mut |js, decided| {
        chosen.push(js);
        let out = choose(leaves, chosen, decided, name_of);
        chosen.pop();
        out
    })
}

/// `obj[path[0]]…[path[n]] = value`, creating the objects on the way, with
/// JavaScript's key order.
fn set_path(obj: &mut Vec<(String, Js)>, path: &[String], value: Js) {
    let Some((key, rest)) = path.split_first() else {
        return;
    };
    if rest.is_empty() {
        serialize::assign(obj, key, value);
        return;
    }
    if !obj
        .iter()
        .any(|(k, v)| k == key && matches!(v, Js::Object(_)))
    {
        serialize::assign(obj, key, Js::Object(Vec::new()));
    }
    if let Some((_, Js::Object(inner))) = obj.iter_mut().find(|(k, _)| k == key) {
        set_path(inner, rest, value);
    }
}

/// `leaf` as a conditional over its known values, each replaced by `then`. A
/// test in `decided` is not asked again.
fn leaf_expr(
    leaf: &Leaf,
    decided: &mut Decided,
    then: &mut dyn FnMut(Js, &mut Decided) -> Option<Expr>,
) -> Option<Expr> {
    match leaf {
        Leaf::Known(js) => then(js.clone(), decided),
        Leaf::Switch(test, cons, alt) => {
            if let Some((_, value)) = decided.iter().find(|(t, _)| t.eq_ignore_span(test)) {
                return leaf_expr(if *value { cons } else { alt }, decided, then);
            }
            decided.push((test.clone(), true));
            let cons = leaf_expr(cons, decided, then);
            decided.pop();
            decided.push((test.clone(), false));
            let alt = leaf_expr(alt, decided, then);
            decided.pop();
            Some(Expr::Cond(CondExpr {
                span: DUMMY_SP,
                test: test.clone(),
                cons: Box::new(cons?),
                alt: Box::new(alt?),
            }))
        }
    }
}

/// The serialized styles `renderOwnClass` hands Emotion for `css`: after
/// `resolveDefaultStyle`, Emotion's `createStringFromObject`. `None` where a
/// value it reads is not followed.
fn styles_text(css: &[(String, Js)]) -> Option<String> {
    let with_defaults = serialize::resolve_default_style(css, |flex| match flex {
        Js::Str(s) => Some(flex_shrink_of(&Value::Str(s.clone()))),
        Js::Num(n) => Some(flex_shrink_of(&Value::Num(*n))),
        _ => None,
    })
    .or_else(|| explain::bail("a layout value resolveDefaultStyle is not followed for"))?;
    serialize::serialize(&with_defaults, &|key, value| match value {
        Js::Str(s) => value_text(key, &Value::Str(s.clone())),
        Js::Num(n) => value_text(key, &Value::Num(*n)),
        _ => None,
    })
    .or_else(|| explain::bail("css Emotion's serialization is not followed for"))
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
            .map(|r| format!("{}{SEP}{}\n", r.class, r.text))
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
    /// `createNode`'s merge of each layout factory's initial props with sample
    /// call-site props, written by `scripts/codegen-extract-tables.ts`.
    const FACTORY_MERGES: &str = include_str!("../tests/fixture/extract/factory-merge.json");

    fn json_expr(value: &serde_json::Value) -> Expr {
        use serde_json::Value as J;
        match value {
            J::Null => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
            J::Bool(b) => Expr::Lit(Lit::Bool(Bool {
                span: DUMMY_SP,
                value: *b,
            })),
            J::Number(n) => initial_expr(InitialValue::Num(n.as_f64().expect("finite"))),
            J::String(text) => str_expr(text),
            J::Array(items) => Expr::Array(ArrayLit {
                span: DUMMY_SP,
                elems: items
                    .iter()
                    .map(|item| {
                        Some(ExprOrSpread {
                            spread: None,
                            expr: Box::new(json_expr(item)),
                        })
                    })
                    .collect(),
            }),
            J::Object(map) if map.get("$undefined") == Some(&J::Bool(true)) => {
                Expr::Ident(Ident::new_no_ctxt(Atom::from("undefined"), DUMMY_SP))
            }
            J::Object(map) => Expr::Object(ObjectLit {
                span: DUMMY_SP,
                props: map
                    .iter()
                    .map(|(k, v)| {
                        PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                            key: PropName::Str(Str::from(Atom::from(k.as_str()))),
                            value: Box::new(json_expr(v)),
                        })))
                    })
                    .collect(),
            }),
        }
    }

    fn json_entries(value: &serde_json::Value) -> Vec<(String, Expr)> {
        value
            .as_array()
            .map(|entries| {
                entries
                    .iter()
                    .map(|entry| {
                        let pair = entry.as_array().expect("an entry is [key, value]");
                        (
                            pair[0].as_str().expect("key").to_string(),
                            json_expr(&pair[1]),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    #[test]
    fn layout_factory_merge_matches_create_node() {
        let cases: Vec<(String, serde_json::Value, serde_json::Value)> =
            serde_json::from_str(FACTORY_MERGES).expect("fixture parses");
        assert!(!cases.is_empty());
        let mut factories = HashSet::new();
        for (name, props, expected) in &cases {
            let (fingerprint, initial) = layout_factory(name).expect("a layout factory");
            factories.insert(name.clone());
            let factory = Factory::Layout {
                fingerprint,
                initial,
            };
            let combined = combine_factory_props(&factory.initial_entries(), &json_entries(props));
            let expected = json_entries(expected);
            let keys = |entries: &[(String, Expr)]| -> Vec<String> {
                entries.iter().map(|(k, _)| k.clone()).collect()
            };
            assert_eq!(keys(&combined), keys(&expected), "{name} {props}");
            for ((key, got), (_, want)) in combined.iter().zip(&expected) {
                assert!(got.eq_ignore_span(want), "{name} {props}: {key}");
            }
        }
        // Every factory in the table, each against every sample.
        assert_eq!(
            factories.len(),
            crate::extract_tables::LAYOUT_FACTORIES.len()
        );
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
            // The fixture writes a key present with `undefined` as null.
            let style: Vec<(String, Js)> = input
                .iter()
                .map(|(k, v)| {
                    let js = match v {
                        serde_json::Value::Null => Js::Undefined,
                        serde_json::Value::String(s) => Js::Str(s.clone()),
                        serde_json::Value::Number(n) => Js::Num(n.as_f64().expect("finite")),
                        other => panic!("unexpected sample {other}"),
                    };
                    (k.clone(), js)
                })
                .collect();
            let out = serialize::resolve_default_style(&style, |flex| match flex {
                Js::Str(s) => Some(flex_shrink_of(&Value::Str(s.clone()))),
                Js::Num(n) => Some(flex_shrink_of(&Value::Num(*n))),
                _ => None,
            })
            .expect("decidable");
            let got: Vec<(String, f64)> = ["flexShrink", "minHeight", "minWidth"]
                .iter()
                .filter(|key| !input.contains_key(**key))
                .filter_map(|key| match out.iter().find(|(k, _)| k == key) {
                    Some((_, Js::Num(n))) => Some((key.to_string(), *n)),
                    _ => None,
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
    fn property_names_follow_emotion() {
        assert_eq!(
            serialize::process_style_name("backgroundColor"),
            "background-color"
        );
        assert_eq!(
            serialize::process_style_name("msTransform"),
            "-ms-transform"
        );
        assert_eq!(serialize::process_style_name("WebkitMask"), "-webkit-mask");
        assert_eq!(serialize::process_style_name("--gap"), "--gap");
        assert_eq!(serialize::process_style_name("line-height"), "line-height");
    }
}
