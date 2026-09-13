//! Factory call-site detection.
//!
//! Identifies which `CallExpression`s in a program are compilable
//! `@meonode/ui` factory calls — calls whose `props` argument is a plain
//! object literal that Task 9's partitioner can safely rewrite into
//! pre-partitioned marker props. This module is detection-only: it never
//! mutates the AST. It records a [`Decision`] per relevant call site (
//! [`Decision::Compilable`] or [`Decision::Bail`] with a reason), so callers
//! (Task 9's rewrite pass) can extend this visitor to act on the results.
//!
//! ## Binding resolution
//!
//! Call-site classification is entirely binding-based, keyed by
//! `(Atom, SyntaxContext)` pairs. This requires the SWC resolver
//! (`swc_ecma_transforms_base::resolver`) to have already run over the
//! program so that every [`Ident`] carries the [`SyntaxContext`] of the
//! binding it actually refers to:
//!
//! - **In the real plugin**: the host (next-swc / `@swc/core`) runs the
//!   resolver before invoking the plugin, and the plugin never applies it
//!   itself — see `TransformPluginProgramMetadata::unresolved_mark` and
//!   `lib.rs::process_transform`. By the time `transform_program` runs, all
//!   `Ident`s in `program` already carry resolved contexts.
//! - **In fixture tests** (`tests/fixture.rs`): the resolver is chained
//!   explicitly, mirroring what the host would otherwise do (`(resolver(...),
//!   ...)` as the `Pass` given to `test_fixture`).
//! - **In this module's unit tests**: a small harness parses a snippet and
//!   runs the resolver by hand before calling [`transform_program`], since
//!   there is no host/`test_fixture` to do it for us.
//!
//! Matching on `(sym, ctxt)` rather than `sym` alone is exactly what lets us
//! tell a genuine `@meonode/ui` import apart from a same-named local that
//! shadows it (`shadowed_div` bailout) — after resolution, the shadowing
//! declaration gets a distinct `SyntaxContext`, so its call sites simply
//! fail to match the tracked binding.

use std::collections::{HashMap, HashSet};

use swc_core::common::{Span, SyntaxContext};
use swc_core::ecma::ast::*;
use swc_core::ecma::atoms::Atom;
use swc_core::ecma::visit::{Visit, VisitWith};

use crate::config::CompileConfig;
use crate::css_props::is_css_prop;
use crate::effect::{is_effect_free, is_order_inert, is_static_literal};
use crate::factories::factory_children_first;
use crate::keys::{is_special_key, key_name_atom};
use crate::order::{order_preserved, EmitRank};

const UI_MODULE: &str = "@meonode/ui";
const UI_MODULE_CLIENT: &str = "@meonode/ui/client";
const MARKER_KEY: &str = "__meo$";
const NODE_NAME: &str = "Node";
const CREATE_NODE_NAME: &str = "createNode";
const CREATE_CHILDREN_FIRST_NODE_NAME: &str = "createChildrenFirstNode";
/// The props key whose value the list-origin classification reads.
const CHILDREN_KEY: &str = "children";

/// A binding key: an identifier's symbol plus the `SyntaxContext` the
/// resolver assigned to the specific binding it refers to. Two idents with
/// the same `sym` but different `ctxt` refer to different bindings (e.g. an
/// import and a shadowing local).
type BindKey = (Atom, SyntaxContext);

/// What kind of @meonode/ui factory a resolved binding refers to, and where
/// its `props` argument lives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CandidateKind {
    /// A known HTML factory (imported directly, e.g. `Div`, `P`, or an
    /// aliased/derived binding of one).
    Html { children_first: bool },
    /// The `Node(element, props, deps)` factory.
    Node,
}

impl CandidateKind {
    /// The 0-based argument index of the `props` object for a call using
    /// this factory kind.
    fn props_arg_idx(self) -> usize {
        match self {
            CandidateKind::Html {
                children_first: false,
            } => 0,
            CandidateKind::Html {
                children_first: true,
            } => 1,
            CandidateKind::Node => 1,
        }
    }
}

/// What an import binding from `@meonode/ui`/`@meonode/ui/client` resolves
/// to. `Creator` bindings (`createNode`/`createChildrenFirstNode` imports)
/// are not call-site candidates themselves — they're only meaningful when
/// used to derive a local factory (`const X = createNode(...)`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImportBinding {
    Candidate(CandidateKind),
    Creator { children_first: bool },
}

/// Why a call site that referenced a tracked (or shadowed) factory binding
/// was not classified as compilable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BailReason {
    /// The callee's `sym` matches a known factory/creator name, but its
    /// resolved `SyntaxContext` doesn't match any tracked binding — i.e. the
    /// name is shadowed by a local declaration, or otherwise not the
    /// `@meonode/ui` import it looks like.
    ShadowedOrUnbound,
    /// The callee was a member expression (`Namespace.Div(...)`) whose
    /// object resolved to a `import * as Namespace from '@meonode/ui'`
    /// binding.
    NamespaceImport,
    /// Zero args, or the props argument position is missing entirely.
    /// Technically still "a candidate call", but there's nothing to
    /// partition, so it's treated as a bail (left untouched).
    MissingPropsArg,
    /// The props argument is present but isn't (syntactically) a plain
    /// object literal — e.g. an identifier, a call, a ternary, a member
    /// expression, or a spread argument.
    NotObjectLiteral,
    /// A property has a computed key (`{ [k]: v }`).
    ComputedKey,
    /// A property has a numeric (or bigint) literal key.
    NumericKey,
    /// The object literal contains a getter or setter accessor property.
    GetterSetterProp,
    /// The object literal contains a shorthand method (`{ foo() {} }`).
    MethodProp,
    /// Any other property kind not covered above (currently only
    /// `Prop::Assign`, which is not valid in a normal object literal
    /// expression but is handled defensively).
    UnsupportedPropKind,
    /// The object literal already has a `__meo$` key (this call site has
    /// presumably already been compiled).
    ExistingMarker,
    /// Bucketing would emit values in a different relative order than they
    /// appear in source, in a way that is observable — the evaluation-order
    /// rule (see `order.rs` and this module's [`validate_object`] doc).
    ///
    /// The rule is *not* "effect-free values may move freely": effect-free is
    /// not value-stable. An identifier read causes no side effect of its own,
    /// yet an effectful sibling can mutate the binding it reads, so moving it
    /// across that sibling changes the observed value:
    ///
    /// ```js
    /// let flag = 'A'; const bump = () => { flag = 'B'; return '9px' }
    /// Div({ 'data-flag': flag, padding: bump() })   // bails
    /// ```
    ///
    /// So: once *any* effectful value is present, the relative order of every
    /// value that is not order-inert must be preserved. Order-inert means
    /// static literals plus closure *definitions* (see
    /// `effect::is_order_inert`) — those can be repartitioned freely. With no
    /// effectful value anywhere, nothing can observe a reordering and the
    /// check is skipped entirely.
    EffectfulReorder,
    /// An argument *before* `props_arg_idx` is a spread (e.g.
    /// `P(...stuff, { color: 'red' })` or `Node(...els, { padding: 1 }, deps)`).
    /// A leading spread means the real runtime argument count — and
    /// therefore which argument actually lands at `props_arg_idx` — isn't
    /// known until runtime, so rewriting "the object literal written at AST
    /// position `props_arg_idx`" could target the wrong runtime argument
    /// entirely. Bail rather than risk a wrong marker placement on
    /// otherwise-valid input.
    SpreadBeforeProps,
    /// A spread property (`...rest`) inside the props object literal itself
    /// appears *after* a static (non-spread) prop, e.g.
    /// `{ padding: 1, ...rest }`. Change 2 (v0.2) allows *leading* spreads —
    /// all spreads before all static props — to compile by leaving the
    /// spread(s) top-level in the emitted object; a trailing spread would
    /// need to win over an earlier static prop for correct precedence, which
    /// the emitted merge order (`{ ...passthroughCss, ...markerCss, ...css }`
    /// at runtime) can't express, since the compiler-bucketed static props
    /// always come after the spread in the emitted shape. See
    /// [`validate_object`]'s doc comment.
    TrailingSpread,
}

/// The detection outcome for a single call expression.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// This call site is a compilable @meonode/ui factory call; its props
    /// object literal is at argument index `props_arg_idx`. Task 9 consumes
    /// this to drive the actual rewrite.
    Compilable { props_arg_idx: usize },
    /// This call site is a genuine factory call whose props *are* an object
    /// literal, but which cannot be partitioned — a spread after static props,
    /// a computed or numeric key, an accessor or method prop, or an ordering
    /// constraint. The props cannot be bucketed, but the call-site key can
    /// still be stamped: it is a hash of filename and span and needs no
    /// knowledge of the props at all.
    ///
    /// Emitted as schema 3 (see `@meonode/ui`'s `SUPPORTED_COMPILER_SCHEMAS`).
    /// No performance benefit — the runtime classifies these props exactly as
    /// it would an uncompiled call site — but the cache key gains a call-site
    /// prefix, so two structurally identical memoized subtrees written in
    /// different places stop colliding.
    KeyOnly { props_arg_idx: usize },
    /// A children-first call site that carries a generated list at argument
    /// 0 but was written with **no props argument at all** — `Span(rows)`.
    /// There is no object literal to mark, so `partition.rs` appends one
    /// holding nothing but the marker and the list flag.
    ///
    /// Emitted only when the props position is exactly one past the last
    /// written argument, so appending fills it without leaving a hole, and
    /// only when the children are [`ChildrenOrigin::Generated`] — a call site
    /// with nothing to report is left exactly as the author wrote it.
    SynthesizeProps { props_arg_idx: usize },
    /// This call site is either not a factory call at all, or is one that
    /// can't (or shouldn't) be rewritten. See [`BailReason`] for why.
    Bail(BailReason),
}

/// Whether a call site's `children` were written out at the call site, or
/// produced by an expression that only runs at runtime.
///
/// An unkeyed list reconciles by position, so deleting or reordering a row
/// hands the next one the previous row's state. React reports this;
/// `@meonode/ui` cannot, because `render()` spreads children variadically
/// into `createElement`, which tells React "a human wrote these out" for
/// every list alike.
///
/// The distinction is not recoverable at runtime. Arguments are evaluated
/// before the callee runs, so by the time `Div({ children })` is entered,
/// `items.map(fn)` has already collapsed into an ordinary `Array`,
/// indistinguishable from `[A(), B(), C()]`. Only the source still knows
/// which one was written, so the answer has to be settled here and carried
/// into the marker. React's JSX transform records the same fact at the same
/// layer, as `isStaticChildren`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChildrenOrigin {
    /// The children are spelled out at the call site — or the call site has
    /// no `children` property at all. Either way there is no runtime-shaped
    /// list here, so the marker stays silent.
    Authored,
    /// The children come out of an expression, so how many there are and in
    /// what order they arrive is only settled once it runs.
    Generated,
}

/// A recorded detection outcome for one call expression, keyed by its span
/// so `partition.rs`'s rewrite pass can correlate decisions back to the
/// matching `CallExpr` (by `(span.lo, span.hi)` byte offsets) once it starts
/// mutating the tree.
#[derive(Debug, Clone)]
pub struct CallSiteDecision {
    pub span: Span,
    pub decision: Decision,
    /// What the source said about this call site's `children`. Orthogonal to
    /// `decision`: it describes the shape of one value rather than whether
    /// the props can be partitioned, and it is recorded for every call site
    /// whose props are an object literal, including ones that bail.
    pub children: ChildrenOrigin,
}

fn is_ui_module(src: &Str) -> bool {
    src.value == UI_MODULE || src.value == UI_MODULE_CLIENT
}

/// Returns `true` if `src` matches one of the user-configured
/// `factoryModules` (Change 4 / v0.2's "Factory recognition beyond
/// @meonode/ui"), e.g. `"@meonode/mui"`.
fn is_factory_module(src: &Str, factory_modules: &[String]) -> bool {
    let src_value = src.value.as_str().unwrap_or_default();
    factory_modules.iter().any(|m| src_value == m.as_str())
}

/// `true` if `name`'s first character is an ASCII uppercase letter — the
/// heuristic `factoryModules` uses to tell a component export (`Button`)
/// apart from a helper export (`createMuiNode`, `isProbablyMuiTheme`), which
/// is ignored. Empty names (shouldn't occur for a real JS identifier) are not
/// capitalized.
fn is_capitalized(name: &str) -> bool {
    name.chars().next().is_some_and(|c| c.is_ascii_uppercase())
}

/// Pass 1: collects `@meonode/ui`/`@meonode/ui/client` import bindings, plus
/// (per Change 4) capitalized named imports from any configured
/// `factoryModules` entry, treated as props-at-arg-0 factories.
///
/// Runs as its own traversal (rather than being folded into the main
/// detector) so that local-factory derivation (pass 2) and call
/// classification (pass 3) always see the complete import table regardless
/// of where in the file the imports happen to be written.
struct ImportCollector<'a> {
    factory_modules: &'a [String],
    bindings: HashMap<BindKey, ImportBinding>,
    namespace_imports: HashSet<BindKey>,
}

impl Visit for ImportCollector<'_> {
    fn visit_import_decl(&mut self, n: &ImportDecl) {
        if n.type_only {
            return;
        }
        if is_ui_module(&n.src) {
            self.collect_ui_module_specifiers(n);
        } else if is_factory_module(&n.src, self.factory_modules) {
            self.collect_factory_module_specifiers(n);
        }
    }
}

impl ImportCollector<'_> {
    fn collect_ui_module_specifiers(&mut self, n: &ImportDecl) {
        for spec in &n.specifiers {
            match spec {
                ImportSpecifier::Named(named) => {
                    if named.is_type_only {
                        continue;
                    }
                    let imported_name: &Atom = match &named.imported {
                        Some(ModuleExportName::Ident(id)) => &id.sym,
                        // A string module export name (`import { "x" as y }`)
                        // can never spell a valid JS identifier factory name;
                        // nothing in @meonode/ui is imported this way.
                        Some(ModuleExportName::Str(_)) => continue,
                        None => &named.local.sym,
                    };
                    let key = (named.local.sym.clone(), named.local.ctxt);

                    if imported_name.as_ref() == NODE_NAME {
                        self.bindings
                            .insert(key, ImportBinding::Candidate(CandidateKind::Node));
                    } else if imported_name.as_ref() == CREATE_NODE_NAME {
                        self.bindings.insert(
                            key,
                            ImportBinding::Creator {
                                children_first: false,
                            },
                        );
                    } else if imported_name.as_ref() == CREATE_CHILDREN_FIRST_NODE_NAME {
                        self.bindings.insert(
                            key,
                            ImportBinding::Creator {
                                children_first: true,
                            },
                        );
                    } else if let Some(children_first) =
                        factory_children_first(imported_name.as_ref())
                    {
                        self.bindings.insert(
                            key,
                            ImportBinding::Candidate(CandidateKind::Html { children_first }),
                        );
                    }
                }
                ImportSpecifier::Namespace(ns) => {
                    self.namespace_imports
                        .insert((ns.local.sym.clone(), ns.local.ctxt));
                }
                ImportSpecifier::Default(_) => {
                    // @meonode/ui has no default export used as a factory;
                    // nothing to track.
                }
            }
        }
    }

    /// Change 4: a capitalized named import from a configured `factoryModules`
    /// entry is treated as a props-at-arg-0 factory, same call shape as a
    /// plain `@meonode/ui` HTML factory (`CandidateKind::Html { children_first:
    /// false }`) — verified against `@meonode/mui`'s real shape, where every
    /// capitalized export is built by `createMuiNode(element, initialProps)`
    /// and takes props as its first (and only) argument. Lowercase exports
    /// (helpers, e.g. `createMuiNode` itself) are ignored outright — not
    /// tracked as anything, so they can never be mistaken for a factory nor
    /// trigger a spurious `ShadowedOrUnbound` bail. Namespace imports are
    /// tracked the same way as `@meonode/ui`'s (bails via `NamespaceImport`).
    fn collect_factory_module_specifiers(&mut self, n: &ImportDecl) {
        for spec in &n.specifiers {
            match spec {
                ImportSpecifier::Named(named) => {
                    if named.is_type_only {
                        continue;
                    }
                    let imported_name: &Atom = match &named.imported {
                        Some(ModuleExportName::Ident(id)) => &id.sym,
                        Some(ModuleExportName::Str(_)) => continue,
                        None => &named.local.sym,
                    };
                    if !is_capitalized(imported_name.as_ref()) {
                        continue;
                    }
                    let key = (named.local.sym.clone(), named.local.ctxt);
                    self.bindings.insert(
                        key,
                        ImportBinding::Candidate(CandidateKind::Html {
                            children_first: false,
                        }),
                    );
                }
                ImportSpecifier::Namespace(ns) => {
                    self.namespace_imports
                        .insert((ns.local.sym.clone(), ns.local.ctxt));
                }
                ImportSpecifier::Default(_) => {}
            }
        }
    }
}

/// Pass 2: derives local factory bindings from same-file
/// `const X = createNode(...)` / `const X = createChildrenFirstNode(...)`
/// declarations, where the creator identifier itself resolves to a tracked
/// `@meonode/ui` import (pass 1's output).
struct LocalFactoryCollector<'a> {
    imports: &'a HashMap<BindKey, ImportBinding>,
    locals: HashMap<BindKey, CandidateKind>,
}

impl Visit for LocalFactoryCollector<'_> {
    fn visit_var_decl(&mut self, n: &VarDecl) {
        if n.kind == VarDeclKind::Const {
            for decl in &n.decls {
                self.collect_declarator(decl);
            }
        }
        n.visit_children_with(self);
    }
}

impl LocalFactoryCollector<'_> {
    fn collect_declarator(&mut self, decl: &VarDeclarator) {
        let Pat::Ident(binding_ident) = &decl.name else {
            return;
        };
        let Some(init) = &decl.init else {
            return;
        };
        let Expr::Call(call) = &**init else {
            return;
        };
        let Callee::Expr(callee_expr) = &call.callee else {
            return;
        };
        let Expr::Ident(callee_ident) = &**callee_expr else {
            return;
        };

        let callee_key = (callee_ident.sym.clone(), callee_ident.ctxt);
        if let Some(ImportBinding::Creator { children_first }) = self.imports.get(&callee_key) {
            let local_key = (binding_ident.id.sym.clone(), binding_ident.id.ctxt);
            self.locals.insert(
                local_key,
                CandidateKind::Html {
                    children_first: *children_first,
                },
            );
        }
    }
}

/// Pass 3: walks every call expression in the program and classifies it
/// against the merged binding table built from passes 1 and 2.
struct Detector {
    bindings: HashMap<BindKey, CandidateKind>,
    /// Every `sym` that has at least one tracked binding somewhere in the
    /// file (regardless of `ctxt`) — used to distinguish "not related to
    /// @meonode/ui at all" (no decision recorded) from "shadowed" (bail).
    tracked_syms: HashSet<Atom>,
    namespace_imports: HashSet<BindKey>,
    decisions: Vec<CallSiteDecision>,
}

impl Visit for Detector {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Some((decision, children)) = self.classify_call(call) {
            self.decisions.push(CallSiteDecision {
                span: call.span,
                decision,
                children,
            });
        }
        call.visit_children_with(self);
    }
}

impl Detector {
    fn classify_call(&self, call: &CallExpr) -> Option<(Decision, ChildrenOrigin)> {
        let Callee::Expr(callee_expr) = &call.callee else {
            return None;
        };

        match &**callee_expr {
            Expr::Ident(id) => {
                let key = (id.sym.clone(), id.ctxt);
                if let Some(kind) = self.bindings.get(&key).copied() {
                    Some(classify_props(call, kind, &self.bindings))
                } else if self.tracked_syms.contains(&id.sym) {
                    Some((
                        Decision::Bail(BailReason::ShadowedOrUnbound),
                        ChildrenOrigin::Authored,
                    ))
                } else {
                    None
                }
            }
            Expr::Member(member) => {
                if let Expr::Ident(obj_id) = &*member.obj {
                    let key = (obj_id.sym.clone(), obj_id.ctxt);
                    if self.namespace_imports.contains(&key) {
                        return Some((
                            Decision::Bail(BailReason::NamespaceImport),
                            ChildrenOrigin::Authored,
                        ));
                    }
                }
                None
            }
            _ => None,
        }
    }
}

fn classify_props(
    call: &CallExpr,
    kind: CandidateKind,
    factories: &HashMap<BindKey, CandidateKind>,
) -> (Decision, ChildrenOrigin) {
    let props_arg_idx = kind.props_arg_idx();
    // A spread in any argument *before* the props position means the real
    // runtime argument count isn't statically known, so "the AST argument at
    // index `props_arg_idx`" isn't provably "the runtime props argument" —
    // see `BailReason::SpreadBeforeProps`. Only relevant for
    // `children_first`/`Node` calls, where `props_arg_idx > 0`; for plain
    // `Html { children_first: false }` factories this range is empty.
    let leading_args_end = props_arg_idx.min(call.args.len());
    if call.args[..leading_args_end]
        .iter()
        .any(|arg| arg.spread.is_some())
    {
        return (
            Decision::Bail(BailReason::SpreadBeforeProps),
            ChildrenOrigin::Authored,
        );
    }

    let Some(arg) = call.args.get(props_arg_idx) else {
        // `Span(rows)` carries its children at argument 0, so it can hold a
        // generated list even with no props object written. Nothing else
        // reaches this branch with children to report: every other factory
        // keeps its children *in* the props object, so a missing props
        // argument means missing children too.
        let children = call_site_children_origin_without_props(call, kind, factories);
        if children == ChildrenOrigin::Generated && call.args.len() == props_arg_idx {
            return (Decision::SynthesizeProps { props_arg_idx }, children);
        }
        return (
            Decision::Bail(BailReason::MissingPropsArg),
            ChildrenOrigin::Authored,
        );
    };
    if arg.spread.is_some() {
        return (
            Decision::Bail(BailReason::NotObjectLiteral),
            ChildrenOrigin::Authored,
        );
    }

    match unwrap_parens(&arg.expr) {
        Expr::Object(obj) => {
            // Read independently of `validate_object`: the two answer
            // different questions, and a call site that only earns
            // `KeyOnly` still emits a marker the list flag belongs in.
            let children = call_site_children_origin(call, kind, obj, factories);
            let decision = match validate_object(obj) {
                Some(reason) if is_key_stampable(&reason) => Decision::KeyOnly { props_arg_idx },
                Some(reason) => Decision::Bail(reason),
                None => Decision::Compilable { props_arg_idx },
            };
            (decision, children)
        }
        // Without an object literal there is no `children` property to read,
        // and nothing is emitted here anyway.
        _ => (
            Decision::Bail(BailReason::NotObjectLiteral),
            ChildrenOrigin::Authored,
        ),
    }
}

/// Finds where this call site's children actually come from, and classifies
/// them.
///
/// There are two sources, and which one applies is decided by the factory,
/// not by what the call site happens to write. A children-first factory is
/// built as
///
/// ```text
/// (children, props, deps) => Node(element, { ...initialProps, ...props, children }, deps)
/// ```
///
/// so its argument 0 is merged in *last* and wins over any `children` the
/// props object might carry — which is why the props type declares
/// `children?: never`. Reading the props object for one of these factories
/// would classify a value the runtime then discards, so argument 0 is the
/// only source consulted there. Every other factory (`Node(element, props,
/// deps)` and props-first HTML factories alike) carries its children in the
/// props object, and argument 0 is the element or the props itself.
fn call_site_children_origin(
    call: &CallExpr,
    kind: CandidateKind,
    obj: &ObjectLit,
    factories: &HashMap<BindKey, CandidateKind>,
) -> ChildrenOrigin {
    if is_children_first(kind) {
        return children_first_arg_origin(call, factories);
    }
    children_origin(obj, factories)
}

/// The same question asked of a call site that has no props object to read —
/// only a children-first factory can answer it, since every other factory
/// keeps its children inside the props object that is missing.
fn call_site_children_origin_without_props(
    call: &CallExpr,
    kind: CandidateKind,
    factories: &HashMap<BindKey, CandidateKind>,
) -> ChildrenOrigin {
    if is_children_first(kind) {
        return children_first_arg_origin(call, factories);
    }
    ChildrenOrigin::Authored
}

fn is_children_first(kind: CandidateKind) -> bool {
    matches!(
        kind,
        CandidateKind::Html {
            children_first: true
        }
    )
}

/// Classifies argument 0 of a children-first call.
fn children_first_arg_origin(
    call: &CallExpr,
    factories: &HashMap<BindKey, CandidateKind>,
) -> ChildrenOrigin {
    // `Span()` passes `children: undefined`, which is no list at all.
    let Some(arg) = call.args.first() else {
        return ChildrenOrigin::Authored;
    };
    // Unreachable where a props argument exists — a leading spread already
    // bailed as `SpreadBeforeProps` — but a spread is an unknown number of
    // children by any route in, so it answers the same way here.
    if arg.spread.is_some() {
        return ChildrenOrigin::Generated;
    }
    expr_children_origin(&arg.expr, factories)
}

/// Classifies the `children` property of a props object literal. A call site
/// with no `children` property is [`ChildrenOrigin::Authored`]: there is no
/// list to report on.
///
/// A repeated key resolves the way the object literal itself would —
/// `{ children: a, children: b }` evaluates to `b` — so the last `children`
/// property wins.
fn children_origin(obj: &ObjectLit, factories: &HashMap<BindKey, CandidateKind>) -> ChildrenOrigin {
    let mut origin = ChildrenOrigin::Authored;
    for prop_or_spread in obj.props.iter() {
        let PropOrSpread::Prop(prop) = prop_or_spread else {
            continue;
        };
        match &**prop {
            // `{ children }` reads a binding that was filled somewhere else,
            // which is the `children: rows` case written shorter.
            Prop::Shorthand(ident) if ident.sym.as_ref() == CHILDREN_KEY => {
                origin = ChildrenOrigin::Generated;
            }
            Prop::KeyValue(kv) if is_children_key(&kv.key) => {
                origin = expr_children_origin(&kv.value, factories);
            }
            // A getter, setter or method named `children` holds a function
            // rather than a child list, and such an object never partitions
            // anyway. There is no list expression here to classify.
            _ => {}
        }
    }
    origin
}

/// Whether this prop key spells `children`. Deliberately does not go through
/// `keys::key_name_atom`, which may only be called on a key [`validate_key`]
/// has already accepted: [`validate_object`] stops at the *first*
/// disqualifying prop, so a computed key can still be sitting further along
/// in an object this runs over.
fn is_children_key(key: &PropName) -> bool {
    match key {
        PropName::Ident(id) => id.sym.as_ref() == CHILDREN_KEY,
        PropName::Str(s) => s.value.as_str().unwrap_or_default() == CHILDREN_KEY,
        PropName::Num(_) | PropName::BigInt(_) | PropName::Computed(_) => false,
    }
}

/// The rule, inverted on purpose: enumerate the shapes that mean "a human
/// wrote these children out" and call everything else generated.
///
/// The ways to *generate* children have no end — `.map`, `.reduce`,
/// `.filter().map()`, `.flatMap`, `Array.from`, `Object.values().map()`, a
/// loop pushing into an array, a spread of a generator, an immediately-invoked
/// arrow, a bare identifier, a helper call, a ternary between two arrays of
/// different length. A list of patterns to catch would never be finished, and
/// every gap in it is a report the user silently never gets. The ways to write
/// children out by hand are few and closed, so matching those instead is
/// exhaustive by construction, and every generated shape falls out of it with
/// no rule of its own.
///
/// The accepted cost is that `children: buildRows()` — a helper returning
/// hand-written children — is called generated, and its caller is asked for
/// keys it does not need. React's transform has the identical false positive
/// for the identical reason, and it is the safe direction to be wrong in: a
/// needless report costs a moment, a missing one costs state landing on the
/// wrong row.
fn expr_children_origin(
    expr: &Expr,
    factories: &HashMap<BindKey, CandidateKind>,
) -> ChildrenOrigin {
    match unwrap_parens(expr) {
        // An array written out in source: every slot is one the author chose,
        // so position is as stable as the source text is. A spread is the
        // exception — its length is a runtime fact, so every slot after it
        // moves when it does.
        Expr::Array(arr) => {
            if arr.elems.iter().flatten().any(|e| e.spread.is_some()) {
                ChildrenOrigin::Generated
            } else {
                ChildrenOrigin::Authored
            }
        }
        // A literal or a template is a single text child; there is no list.
        Expr::Lit(_) | Expr::Tpl(_) => ChildrenOrigin::Authored,
        // A call to a tracked factory binding returns one node and never an
        // array — that is this compiler's knowledge of its own API, not a
        // guess made from the callee's name. Every other call (`buildRows()`)
        // is opaque, and so is generated.
        Expr::Call(call) => {
            if is_factory_call(call, factories) {
                ChildrenOrigin::Authored
            } else {
                ChildrenOrigin::Generated
            }
        }
        _ => ChildrenOrigin::Generated,
    }
}

/// Whether `call`'s callee resolves to one of the factory bindings this file
/// tracks — an `@meonode/ui` import, a `factoryModules` import, or a local
/// derived from `createNode`. A member-expression callee, a namespace
/// import's `UI.Div(...)` included, is not tracked and so is not a factory
/// as far as this can tell.
fn is_factory_call(call: &CallExpr, factories: &HashMap<BindKey, CandidateKind>) -> bool {
    let Callee::Expr(callee) = &call.callee else {
        return false;
    };
    let Expr::Ident(id) = unwrap_parens(callee) else {
        return false;
    };
    factories.contains_key(&(id.sym.clone(), id.ctxt))
}

/// Whether a bail reason still permits stamping the call-site key.
///
/// True for every reason that means "this object literal cannot be
/// *partitioned*" — appending two constant marker props changes neither
/// evaluation order nor any value, so it is safe regardless of why bucketing
/// was refused.
///
/// False for [`BailReason::ExistingMarker`]: that call site already carries a
/// marker, and stamping a second one would produce a contradictory contract.
///
/// False for [`BailReason::ComputedKey`] for the same reason, less obviously.
/// The existing-marker check reads `PropName::Ident` and `PropName::Str` only,
/// so a marker written with a computed key — `{ [COMPILED_MARKER]: 3 }`, which
/// is how a caller referencing the exported constant writes it — is invisible
/// to it. Such a call site bails as `ComputedKey`, and stamping there would
/// append a second `__meo$` beside one the plugin simply could not see. Since a
/// computed key is by definition not statically resolvable, the conservative
/// reading is that any computed key *might* be the marker, so these call sites
/// forgo the key. They lose collision immunity, which is the same position they
/// were in before schema 3 existed — strictly better than emitting a
/// contradictory contract.
fn is_key_stampable(reason: &BailReason) -> bool {
    match reason {
        BailReason::TrailingSpread
        | BailReason::NumericKey
        | BailReason::GetterSetterProp
        | BailReason::MethodProp
        | BailReason::UnsupportedPropKind
        | BailReason::EffectfulReorder => true,
        BailReason::ComputedKey
        | BailReason::ExistingMarker
        | BailReason::ShadowedOrUnbound
        | BailReason::NamespaceImport
        | BailReason::MissingPropsArg
        | BailReason::NotObjectLiteral
        | BailReason::SpreadBeforeProps => false,
    }
}

fn unwrap_parens(mut expr: &Expr) -> &Expr {
    while let Expr::Paren(paren) = expr {
        expr = &paren.expr;
    }
    expr
}

/// Returns this prop's [`EmitRank`] — where `partition.rs`'s rewrite will
/// place it — for the evaluation-order check in [`validate_object`]. Mirrors
/// `partition.rs::rewrite_object`'s own bucket-assignment precedence exactly:
/// the two must never diverge, or this analysis would be judging an emission
/// shape that isn't the one actually produced.
///
/// `has_spread` and `is_static` encode the stable-key-safety rule (see this
/// module's doc comment on "Leading spreads and the stable-key hazard"): when
/// the object has a leading spread, a non-special prop whose value isn't a
/// static literal is **not** bucketed into `c`/`d` — it stays flat, at
/// [`EmitRank::Spread`], same as the spread(s) themselves. `is_static` is
/// irrelevant (and ignored) when `has_spread` is `false`, since bucketing is
/// unconditional in that case.
fn rank_for_prop(name: &str, is_static: bool, has_spread: bool) -> EmitRank {
    if is_special_key(name) {
        EmitRank::Special
    } else if has_spread && !is_static {
        EmitRank::Spread
    } else if is_css_prop(name) {
        EmitRank::Css
    } else {
        EmitRank::Data
    }
}

/// Validates an object literal as a compilable props object. Returns `None`
/// if it's clean, or the first disqualifying [`BailReason`] found.
///
/// The existing-marker check runs over every property first (independent of
/// structural validity) so a call site that already has `__meo$` is always
/// reported as [`BailReason::ExistingMarker`], even if it happens to also
/// contain some other bail-worthy shape.
///
/// ## Leading spreads (Change 2)
///
/// A spread property (`...rest`) is allowed only while every prop seen so far
/// has *also* been a spread — i.e. all spreads must precede all static props.
/// The first static (non-spread) prop flips a `seen_static_prop` flag; any
/// spread encountered afterward bails with [`BailReason::TrailingSpread`].
/// Leading spreads stay top-level in the emitted object (`partition.rs`
/// doesn't bucket them), so their relative order amongst each other is
/// preserved automatically — nothing here needs to reorder them.
///
/// ## Leading spreads and the stable-key hazard
///
/// A spread's contents aren't known until runtime, so `@meonode/ui`'s
/// `BaseNode._getStableKey` can never safely use the compiled marker's `k` +
/// `dyn` fast path for a call site with a spread: `k` is a pure function of
/// call-site *source position*, so two evaluations of the same call site
/// with *different* spread contents would get an identical `k` — and if the
/// node also carries a `deps` array, that identical stable key is the
/// `elementCache` lookup key, so a stale cached element (built from the
/// *first* evaluation's props) could be returned for the second. `k`/`dyn`
/// are therefore never emitted at all when a spread is present (see
/// `partition.rs::rewrite_object`); `_getStableKey` falls back to its legacy
/// `createPropSignature` path (already covered by `@meonode/ui`'s own test:
/// "marker without k falls back to the legacy signature path").
///
/// That legacy path only hashes an object-*valued* top-level prop
/// *structurally* (by its key names, not its nested values — see
/// `NodeUtil._serializePropValue`'s object branch) — fine for the spread's
/// own contents (spread-contributed keys land flat at the top level, so
/// they're hashed *by value* like any ordinary prop) but NOT fine for a
/// prop that *would* have been safely representable via `dyn` (i.e. isn't a
/// static literal): if such a prop got bucketed into `c`/`d` as usual, its
/// actual value would become invisible to the legacy fallback (hidden one
/// level deeper, behind the bucket object's own structural hash), silently
/// re-introducing the exact same collision hazard for an ordinary dynamic
/// prop instead of a spread. So whenever a spread is present, a non-special
/// prop is only bucketed into `c`/`d` when its value is a static literal
/// (`effect::is_static_literal`) — anything else stays flat at the top
/// level (same position class as the spread itself), exactly matching where
/// it would sit in genuinely uncompiled code, which the legacy signature
/// path already hashes correctly. See [`rank_for_prop`].
///
/// ## Evaluation-order safety (v0.2 rule, Change 1)
///
/// `partition.rs` reorders evaluation: every prop lands in a bucket
/// (`Spread` < `Css` < `Data` < `Special`, see [`EmitRank`]), and cross-bucket
/// order is *not* source order — only same-bucket relative order is
/// preserved. Effect-free values (`effect::is_effect_free`) can't observe
/// this, so only *effectful* values' relative order matters. This function
/// collects every prop's (or leading spread argument's) [`EmitRank`] and
/// whether its value is effectful, in source order, then hands the
/// effectful-only subsequence to [`order_preserved`]; a `false` result bails
/// with [`BailReason::EffectfulReorder`].
///
/// This subsumes v1's `children`-last exception: a source-final effectful
/// `children` is just the (trivially-fine) one-effectful-value case, since
/// `children`'s `Special` rank is emitted after `Css`/`Data`, matching where
/// it already was, and there being only one effectful value overall means
/// there's nothing to reorder it relative to.
fn validate_object(obj: &ObjectLit) -> Option<BailReason> {
    if obj.props.iter().any(is_marker_prop) {
        return Some(BailReason::ExistingMarker);
    }

    let has_spread = obj
        .props
        .iter()
        .any(|p| matches!(p, PropOrSpread::Spread(_)));

    let mut seen_static_prop = false;
    // (rank, is_effectful, is_reorderable) per prop/spread, in source order.
    // `is_reorderable` marks values that are inert under any reordering, i.e.
    // static literals. Non-static values are NOT reorderable even when they are
    // effect-free: an identifier read causes no side effect but can still be
    // *affected* by one, so moving it across an effectful value can change the
    // value read (see the ordering check below).
    let mut items: Vec<(EmitRank, bool, bool)> = Vec::with_capacity(obj.props.len());

    for prop_or_spread in obj.props.iter() {
        match prop_or_spread {
            PropOrSpread::Spread(spread) => {
                if seen_static_prop {
                    return Some(BailReason::TrailingSpread);
                }
                items.push((EmitRank::Spread, !is_effect_free(&spread.expr), false));
            }
            PropOrSpread::Prop(prop) => {
                seen_static_prop = true;
                match &**prop {
                    // Shorthand's implicit value is the identifier itself,
                    // which is always effect-free (reading a binding) but
                    // never a static literal.
                    Prop::Shorthand(ident) => {
                        let rank = rank_for_prop(ident.sym.as_ref(), false, has_spread);
                        items.push((rank, false, false));
                    }
                    Prop::KeyValue(kv) => {
                        if let Some(reason) = validate_key(&kv.key) {
                            return Some(reason);
                        }
                        let name = key_name_atom(&kv.key);
                        let is_static = is_static_literal(&kv.value);
                        let rank = rank_for_prop(name.as_ref(), is_static, has_spread);
                        // NB: `is_static` (literal-ness) drives bucket placement and
                        // must mirror partition.rs. Reorderability is the broader
                        // `is_order_inert`, which also covers closure definitions.
                        items.push((rank, !is_effect_free(&kv.value), is_order_inert(&kv.value)));
                    }
                    Prop::Getter(_) | Prop::Setter(_) => {
                        return Some(BailReason::GetterSetterProp);
                    }
                    Prop::Method(_) => return Some(BailReason::MethodProp),
                    Prop::Assign(_) => return Some(BailReason::UnsupportedPropKind),
                }
            }
        }
    }

    // Reordering is only observable when at least one value has a side effect:
    // with no effectful value present, every value is a pure read and their
    // relative order cannot be detected. Once one effectful value exists, it may
    // mutate state that any *non-static* value reads, so the order of all
    // non-static values -- not merely the effectful ones -- must be preserved.
    // Static literals stay genuinely inert and may be repartitioned freely.
    if items.iter().any(|(_, effectful, _)| *effectful) {
        let ordered_ranks = items
            .iter()
            .filter(|(_, _, reorderable)| !*reorderable)
            .map(|(rank, _, _)| *rank);
        if !order_preserved(ordered_ranks) {
            return Some(BailReason::EffectfulReorder);
        }
    }

    None
}

fn is_marker_prop(prop_or_spread: &PropOrSpread) -> bool {
    let PropOrSpread::Prop(prop) = prop_or_spread else {
        return false;
    };
    match &**prop {
        Prop::Shorthand(id) => id.sym.as_ref() == MARKER_KEY,
        Prop::KeyValue(kv) => match &kv.key {
            PropName::Ident(id) => id.sym.as_ref() == MARKER_KEY,
            PropName::Str(s) => s.value == MARKER_KEY,
            _ => false,
        },
        _ => false,
    }
}

/// Validates a prop key's *kind*. As of v0.2 (Change 3), any string literal
/// key is fine — including non-identifier-like ones (`'data-parallax'`,
/// `'aria-label'`) — since they bucket normally and are emitted as quoted
/// keys, using the same `PropName` node they were parsed with (see
/// `partition.rs::rewrite_object`, which re-pushes the original `Prop`
/// unchanged). Only computed and numeric/bigint keys are structurally
/// unemittable in this shape and still bail.
fn validate_key(key: &PropName) -> Option<BailReason> {
    match key {
        PropName::Ident(_) | PropName::Str(_) => None,
        PropName::Num(_) | PropName::BigInt(_) => Some(BailReason::NumericKey),
        PropName::Computed(_) => Some(BailReason::ComputedKey),
    }
}

/// Runs the full three-pass detector over `program` and returns every
/// recorded call-site decision, in traversal order. `config.factory_modules`
/// (Change 4) extends pass 1's import recognition beyond `@meonode/ui`.
///
/// This is read-only: it never mutates `program`. The returned decisions are
/// consumed by Task 9's rewrite pass; for now nothing acts on them.
pub fn detect(program: &Program, config: &CompileConfig) -> Vec<CallSiteDecision> {
    let mut imports = ImportCollector {
        factory_modules: &config.factory_modules,
        bindings: HashMap::new(),
        namespace_imports: HashSet::new(),
    };
    program.visit_with(&mut imports);

    let mut locals = LocalFactoryCollector {
        imports: &imports.bindings,
        locals: HashMap::new(),
    };
    program.visit_with(&mut locals);

    let mut bindings: HashMap<BindKey, CandidateKind> = HashMap::new();
    for (key, binding) in &imports.bindings {
        if let ImportBinding::Candidate(kind) = binding {
            bindings.insert(key.clone(), *kind);
        }
    }
    bindings.extend(locals.locals);

    let tracked_syms: HashSet<Atom> = bindings.keys().map(|(sym, _)| sym.clone()).collect();

    let mut detector = Detector {
        bindings,
        tracked_syms,
        namespace_imports: imports.namespace_imports,
        decisions: Vec::new(),
    };
    program.visit_with(&mut detector);
    detector.decisions
}

/// Public entry point. Runs detection over `program` and returns the
/// recorded decisions; intentionally does not mutate `program`.
///
/// `partition::transform_program` (wired into `lib.rs::process_transform`)
/// calls this first to find every `Decision::Compilable` call site before it
/// starts rewriting anything. `tests/fixture.rs` also calls this directly
/// (via a detect-only `Pass`) to exercise detection in isolation, proving the
/// visitor traverses these shapes without mutating anything on its own.
pub fn transform_program(program: &Program, config: &CompileConfig) -> Vec<CallSiteDecision> {
    detect(program, config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use swc_core::common::sync::Lrc;
    use swc_core::common::{FileName, Globals, Mark, SourceMap, GLOBALS};
    use swc_core::ecma::ast::EsVersion;
    use swc_core::ecma::parser::lexer::Lexer;
    use swc_core::ecma::parser::{EsSyntax, Parser, StringInput, Syntax};
    use swc_core::ecma::transforms::base::resolver;
    use swc_core::ecma::visit::VisitMutWith;

    /// Parses `src` as an ES module, runs the resolver (mirroring what the
    /// swc plugin host does before invoking the plugin), then runs detection
    /// with the default (empty `factoryModules`) config and returns the
    /// recorded [`Decision`]s in traversal order.
    /// Regression: an effect-FREE value is not necessarily value-STABLE.
    /// `flag` is a plain identifier read (no side effect of its own), but an
    /// effectful sibling can mutate the binding it reads, so moving it across
    /// that sibling changes the observed value:
    ///   let flag = 'A'; const bump = () => { flag = 'B'; return '9px' }
    ///   Div({ 'data-flag': flag, padding: bump() })
    /// `data-flag` ranks Data, `padding` ranks Css, so emission would run
    /// `bump()` before reading `flag` -> "A" becomes "B".
    #[test]
    fn effect_free_but_mutable_read_reordered_across_effectful_bails() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ 'data-flag': flag, padding: bump() })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::KeyOnly { props_arg_idx: 0 }]
        );
    }

    /// Same hazard with a `Special`-ranked reader instead of a `Data`-ranked one.
    #[test]
    fn special_ranked_read_reordered_across_effectful_bails() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ children: label, padding: bump() })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::KeyOnly { props_arg_idx: 0 }]
        );
    }

    /// The relaxation must still hold for its motivating cases: a single
    /// non-static value alongside only static literals is trivially ordered.
    #[test]
    fn key_member_expr_with_static_siblings_still_compiles() {
        let src = r#"
            import { Row } from '@meonode/ui'
            Row({ key: b.label, alignItems: 'center', gap: 8 })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Compilable { props_arg_idx: 0 }]
        );
    }

    #[test]
    fn dynamic_css_value_with_static_siblings_still_compiles() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ width: 8, backgroundColor: b.color, borderRadius: '50%' })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Compilable { props_arg_idx: 0 }]
        );
    }

    /// With no effectful value present at all, pure reads may be reordered
    /// freely -- nothing can observe the difference.
    #[test]
    fn multiple_pure_reads_without_effectful_value_compiles() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ id: someId, padding: somePadding, color: someColor })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Compilable { props_arg_idx: 0 }]
        );
    }

    /// A closure definition performs no read and no effect, so its position
    /// among siblings is unobservable. Writing a handler before style props is
    /// an extremely common shape and must not bail. (Measured on the docs site:
    /// this pattern alone accounted for 3 of 5 remaining EffectfulReorder bails.)
    #[test]
    fn arrow_before_effectful_style_props_compiles() {
        let src = r#"
            import { Button } from '@meonode/ui'
            Button(category, {
                onClick: () => setSelectedCategory(category),
                padding: '8px 16px',
                borderColor: selected === category ? 'theme.primary' : 'theme.border',
            })
        "#;
        // `Button` is children-first, so props sit at arg 1.
        assert_eq!(
            decisions_for(src),
            vec![Decision::Compilable { props_arg_idx: 1 }]
        );
    }

    #[test]
    fn function_expression_is_order_inert_too() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ onClick: function () { return x }, padding: cond ? a : b })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Compilable { props_arg_idx: 0 }]
        );
    }

    /// Guard against over-widening: only the closure *definition* is inert.
    /// An immediately-invoked arrow actually runs, so it stays order-sensitive.
    #[test]
    fn immediately_invoked_arrow_still_bails() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ 'data-flag': flag, padding: (() => bump())() })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::KeyOnly { props_arg_idx: 0 }]
        );
    }

    fn decisions_for(src: &str) -> Vec<Decision> {
        decisions_for_with_config(src, &CompileConfig::default())
    }

    /// Like [`decisions_for`], but with a caller-supplied [`CompileConfig`] —
    /// used to exercise Change 4's `factoryModules` option directly, since
    /// `TransformPluginProgramMetadata::get_transform_plugin_config` always
    /// returns `None` outside a real wasm32 plugin host (see `config.rs`),
    /// making the JSON-metadata path itself untestable from `cargo test`.
    fn decisions_for_with_config(src: &str, config: &CompileConfig) -> Vec<Decision> {
        sites_for_with_config(src, config)
            .into_iter()
            .map(|d| d.decision)
            .collect()
    }

    /// The raw [`CallSiteDecision`]s, for tests that need more than the
    /// [`Decision`] itself.
    fn sites_for_with_config(src: &str, config: &CompileConfig) -> Vec<CallSiteDecision> {
        GLOBALS.set(&Globals::new(), || {
            let cm: Lrc<SourceMap> = Default::default();
            let fm = cm.new_source_file(Lrc::new(FileName::Anon), src.to_string());

            let lexer = Lexer::new(
                Syntax::Es(EsSyntax::default()),
                EsVersion::EsNext,
                StringInput::from(&*fm),
                None,
            );
            let mut parser = Parser::new_from(lexer);
            let mut program = parser
                .parse_program()
                .unwrap_or_else(|e| panic!("failed to parse test snippet: {e:?}\n---\n{src}"));

            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();
            program.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

            detect(&program, config)
        })
    }

    /// Every recorded [`ChildrenOrigin`], in traversal order — the
    /// classification these tests exist to pin down. Kept separate from
    /// [`decisions_for`] because the two are orthogonal facts about a call
    /// site: whether its props can be partitioned, and what its `children`
    /// value was written as.
    fn children_origins_for(src: &str) -> Vec<ChildrenOrigin> {
        sites_for_with_config(src, &CompileConfig::default())
            .into_iter()
            .map(|d| d.children)
            .collect()
    }

    /// Asserts that `children_expr`, written as the `children` value of a
    /// single `Div` call, classifies as `expected`. Every case below is one
    /// line of source and one expected answer, so they read as the table
    /// they are.
    fn assert_children(children_expr: &str, expected: ChildrenOrigin) {
        let src = format!(
            "import {{ Div, Section }} from '@meonode/ui'\nDiv({{ children: {children_expr} }})"
        );
        assert_eq!(
            children_origins_for(&src),
            vec![expected],
            "children: {children_expr}"
        );
    }

    #[test]
    fn named_import_div_is_compilable_at_arg_0() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn aliased_import_is_compilable() {
        let decisions = decisions_for(
            r#"
            import { Div as D } from '@meonode/ui';
            D({ padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn children_first_factory_is_compilable_at_arg_1() {
        let decisions = decisions_for(
            r#"
            import { P } from '@meonode/ui';
            P('hello', { color: 'red' });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 1 }]);
    }

    #[test]
    fn node_factory_is_compilable_at_arg_1() {
        let decisions = decisions_for(
            r#"
            import { Node } from '@meonode/ui';
            Node('div', { padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 1 }]);
    }

    #[test]
    fn client_subpath_import_is_tracked() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui/client';
            Div({ padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn local_create_node_binding_is_compilable() {
        let decisions = decisions_for(
            r#"
            import { createNode } from '@meonode/ui';
            const Box = createNode('div');
            Box({ padding: 1 });
            "#,
        );
        // Two calls happen here: `createNode('div')` itself (not a
        // candidate — creators aren't callable candidates) and
        // `Box({...})` (compilable). Only one decision should be recorded.
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn local_create_children_first_node_binding_uses_arg_1() {
        let decisions = decisions_for(
            r#"
            import { createChildrenFirstNode } from '@meonode/ui';
            const Text = createChildrenFirstNode('p');
            Text('hi', { color: 'red' });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 1 }]);
    }

    #[test]
    fn shadowed_import_bails() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            function f() {
              const Div = something();
              return Div({ padding: 1 });
            }
            "#,
        );
        assert_eq!(
            decisions,
            vec![Decision::Bail(BailReason::ShadowedOrUnbound)]
        );
    }

    #[test]
    fn namespace_import_bails() {
        let decisions = decisions_for(
            r#"
            import * as M from '@meonode/ui';
            M.Div({ padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Bail(BailReason::NamespaceImport)]);
    }

    #[test]
    fn non_object_props_bails() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            const props = { padding: 1 };
            Div(props);
            "#,
        );
        assert_eq!(
            decisions,
            vec![Decision::Bail(BailReason::NotObjectLiteral)]
        );
    }

    #[test]
    fn leading_spread_in_props_is_fine() {
        // Change 2: a spread preceding every static prop compiles — the
        // spread stays top-level in the emitted object; only `padding` gets
        // bucketed.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            const rest = {};
            Div({ ...rest, padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn multiple_leading_spreads_are_fine() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            const a = {};
            const b = {};
            Div({ ...a, ...b, padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn trailing_spread_bails() {
        // A spread *after* a static prop would need to win over that
        // preceding prop for correct precedence, which the emitted merge
        // order can't express — see `BailReason::TrailingSpread`.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            const rest = {};
            Div({ padding: 1, ...rest });
            "#,
        );
        assert_eq!(decisions, vec![Decision::KeyOnly { props_arg_idx: 0 }]);
    }

    #[test]
    fn spread_sandwiched_between_static_props_bails() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            const rest = {};
            Div({ padding: 1, ...rest, color: 'red' });
            "#,
        );
        assert_eq!(decisions, vec![Decision::KeyOnly { props_arg_idx: 0 }]);
    }

    #[test]
    fn spread_only_props_is_fine() {
        // No static props at all — still a valid (if degenerate) leading
        // spread: nothing to bucket, spread stays top-level.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            const rest = {};
            Div({ ...rest });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn effectful_spread_argument_as_only_effectful_value_is_fine() {
        // `f()` (the spread's argument) is the only effectful value in the
        // object; trivially order-preserving.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ ...f(), padding: '1px' });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    // --- Stable-key hazard: spread + a non-static-literal (would-be `dyn`)
    // prop reclassified to `EmitRank::Spread` (see `rank_for_prop`) ---

    #[test]
    fn spread_plus_two_effectful_calls_in_source_order_compiles() {
        // `onClick: f()` gets reclassified to `EmitRank::Spread` (has_spread
        // + non-static value), same rank as the spread itself; `children:
        // [g()]` stays `EmitRank::Special`. Source order onClick-then-children
        // is Spread(0) -> Special(3): non-decreasing, compiles.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ ...props, onClick: f(), children: [g()] });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn spread_plus_reordered_effectful_calls_bails() {
        // Same two effectful values, source order reversed: `children: [g()]`
        // (Special, rank 3) before `onClick: f()` (reclassified to
        // EmitRank::Spread, rank 0, because of the spread) — 3 then 0 is a
        // genuine decrease, so this bails via `EffectfulReorder` even though
        // both values individually look eligible.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ ...props, children: [g()], onClick: f() });
            "#,
        );
        assert_eq!(decisions, vec![Decision::KeyOnly { props_arg_idx: 0 }]);
    }

    #[test]
    fn spread_plus_dynamic_but_effect_free_prop_is_fine() {
        // `onClick: handler` is dynamic (not a static literal) but
        // effect-free (an identifier read) — reclassified to
        // `EmitRank::Spread` for bucketing purposes, but since it's not
        // effectful at all, order-analysis doesn't even consider it.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ ...props, onClick: handler, padding: '1px' });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    /// A computed key forgoes the call-site key as well as partitioning.
    ///
    /// The key alone would be safe against *evaluation order* — it appends two
    /// constant props and changes nothing — but not against a marker the
    /// existing-marker check cannot see. `{ [COMPILED_MARKER]: 3 }` is a marker
    /// written with a computed key, and stamping there emits a second `__meo$`
    /// beside it. Since a computed key is not statically resolvable, the only
    /// sound reading is that it might be the marker.
    #[test]
    fn computed_key_bails_without_a_key() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            const key = 'padding';
            Div({ [key]: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Bail(BailReason::ComputedKey)]);
    }

    /// The case that motivated it: a caller stamping the marker themselves via
    /// the exported constant. Nothing may be appended here.
    #[test]
    fn computed_marker_key_is_never_double_stamped() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ [COMPILED_MARKER]: 3, [SK.key]: 'site', padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Bail(BailReason::ComputedKey)]);
    }

    #[test]
    fn identifier_like_string_key_is_fine() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ "padding": 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn non_identifier_like_string_key_is_fine() {
        // Change 3 (v0.2): non-identifier string keys (`'foo-bar'`,
        // `'data-parallax'`, `'aria-label'`) used to bail with
        // `NonIdentifierStringKey` — an oversight, not a safety requirement.
        // They now bucket normally, emitted with their original quoted key.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ "foo-bar": 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn quoted_data_attribute_key_is_fine() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ padding: '4px', "data-parallax": "true", "aria-label": "hi" });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn numeric_key_bails() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ 0: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::KeyOnly { props_arg_idx: 0 }]);
    }

    #[test]
    fn getter_setter_prop_bails() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ get padding() { return 1; } });
            "#,
        );
        assert_eq!(decisions, vec![Decision::KeyOnly { props_arg_idx: 0 }]);
    }

    #[test]
    fn method_shorthand_key_bails() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ onClick() {} });
            "#,
        );
        assert_eq!(decisions, vec![Decision::KeyOnly { props_arg_idx: 0 }]);
    }

    #[test]
    fn function_value_prop_is_fine() {
        // A method *shorthand* bails, but a plain key/value pair whose
        // value happens to be a function expression is just a normal
        // (dynamic) prop — not a bail.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ onClick: function () {} });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn existing_marker_bails() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ __meo$: 1, padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Bail(BailReason::ExistingMarker)]);
    }

    #[test]
    fn missing_props_arg_bails() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div();
            "#,
        );
        assert_eq!(decisions, vec![Decision::Bail(BailReason::MissingPropsArg)]);
    }

    #[test]
    fn spread_before_props_bails_for_children_first_factory() {
        // `stuff` spreads into the children-first argument position, so
        // whatever ends up at AST index 1 isn't provably the runtime props
        // argument — the real props object could land anywhere depending on
        // how many elements `stuff` spreads in.
        let decisions = decisions_for(
            r#"
            import { P } from '@meonode/ui';
            P(...stuff, { color: 'red' });
            "#,
        );
        assert_eq!(
            decisions,
            vec![Decision::Bail(BailReason::SpreadBeforeProps)]
        );
    }

    #[test]
    fn spread_before_props_bails_for_node() {
        let decisions = decisions_for(
            r#"
            import { Node } from '@meonode/ui';
            Node(...els, { padding: 1 });
            "#,
        );
        assert_eq!(
            decisions,
            vec![Decision::Bail(BailReason::SpreadBeforeProps)]
        );
    }

    #[test]
    fn spread_before_props_check_does_not_affect_html_factories() {
        // `props_arg_idx` is 0 for plain (non-children-first) HTML
        // factories, so there's no "before props" range to check at all —
        // make sure the new guard doesn't somehow reject a normal call.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn single_effectful_call_value_is_fine() {
        // v0.2: with only one effectful value in the whole object (`x: f()`
        // — `padding: 1` is a static literal), there's nothing to reorder it
        // relative to, so this compiles (v1 bailed on any effectful value at
        // all).
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ padding: 1, x: f() });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn single_effectful_member_expr_value_is_fine() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ padding: 1, x: a.b });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn two_effectful_values_in_source_and_emit_order_compiles() {
        // `padding` (Css bucket, effectful: `g()`) precedes `onClick` (Data
        // bucket, effectful: `f()`) in both source order *and* emitted order
        // (Css always emits before Data) — no reorder, so this compiles.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ padding: g(), onClick: f() });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn two_effectful_values_reordered_by_bucketing_bails() {
        // `onClick` (Data bucket, effectful: `f()`) precedes `padding` (Css
        // bucket, effectful: `g()`) in source, but emission always puts Css
        // before Data — so compiling would run `g()` before `f()`, the
        // reverse of source order. Bails via `EffectfulReorder`.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ onClick: f(), padding: g() });
            "#,
        );
        assert_eq!(decisions, vec![Decision::KeyOnly { props_arg_idx: 0 }]);
    }

    #[test]
    fn effect_free_prop_values_are_fine() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ padding: '20px', width, onClick: () => {}, css: { color: 'red' }, children: ['a', 'b'] });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn effectful_children_as_last_prop_is_fine() {
        let decisions = decisions_for(
            r#"
            import { Div, P } from '@meonode/ui';
            Div({ padding: '1px', onClick: h, children: [Div({ color: 'red' }), P('x', { color: 'blue' })] });
            "#,
        );
        // `children` is the *only* effectful value here (`onClick: h` is an
        // identifier read, effect-free) — trivially order-preserving under
        // v0.2 regardless of its source position (subsuming v1's
        // `children`-last exception). Both the outer call and the two nested
        // factory calls used as `children` are independently compilable.
        assert_eq!(
            decisions,
            vec![
                Decision::Compilable { props_arg_idx: 0 },
                Decision::Compilable { props_arg_idx: 0 },
                Decision::Compilable { props_arg_idx: 1 },
            ]
        );
    }

    #[test]
    fn effectful_children_as_only_prop_is_fine() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ children: [f()] });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn effectful_children_not_last_but_only_effectful_value_is_fine() {
        // v0.2 (Change 1) subsumes and strictly widens v1's `children`-last
        // exception: `children: [f()]` is the *only* effectful value here —
        // `padding: '1px'` is a static literal — so this now compiles even
        // though `children` isn't source-final. v1 bailed on this shape
        // (`EffectfulValue`, since the old exception required `children` to
        // be last); the Rust fixture `transform_children_not_last_bail` is
        // updated to match (renamed/re-asserted as compiling — see its
        // module comment).
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ children: [f()], padding: '1px' });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn effectful_children_not_last_with_second_effectful_value_bails() {
        // Now `onClick: g()` is a *second* effectful value (Data bucket),
        // source-before the effectful `children` (Special bucket) — Data
        // emits before Special, so source order (children, then onClick) is
        // preserved... wait: source order here is `children` first, then
        // `onClick`. Emitted order is Data (`onClick`) before Special
        // (`children`) — a genuine reorder. Bails via `EffectfulReorder`.
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            Div({ children: [f()], onClick: g() });
            "#,
        );
        assert_eq!(decisions, vec![Decision::KeyOnly { props_arg_idx: 0 }]);
    }

    #[test]
    fn children_first_factory_arg0_is_unconstrained() {
        // `P`'s children arg (index 0) is a separate call argument, never
        // part of the props object — no effect-free constraint applies to
        // it at all, even though it's an arbitrary call expression here.
        let decisions = decisions_for(
            r#"
            import { P } from '@meonode/ui';
            P(someCall(), { color: 'red' });
            "#,
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 1 }]);
    }

    #[test]
    fn unrelated_calls_are_ignored() {
        let decisions = decisions_for(
            r#"
            import { Div } from '@meonode/ui';
            console.log('hello');
            someOtherFunction({ padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![]);
    }

    // --- Change 4: `factoryModules` plugin config ---

    fn mui_config() -> CompileConfig {
        CompileConfig {
            factory_modules: vec!["@meonode/mui".to_string()],
        }
    }

    #[test]
    fn capitalized_import_from_configured_module_is_compilable() {
        let decisions = decisions_for_with_config(
            r#"
            import { Button } from '@meonode/mui';
            Button({ padding: 1 });
            "#,
            &mui_config(),
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn lowercase_import_from_configured_module_is_ignored() {
        // `createMuiNode` is a helper export, not a component — it's simply
        // not tracked at all, so calling it isn't a candidate call site (and
        // doesn't need to be, since it's an internal implementation detail
        // of `@meonode/mui`, never called directly by consumers per the
        // v0.2 design doc).
        let decisions = decisions_for_with_config(
            r#"
            import { createMuiNode, isProbablyMuiTheme } from '@meonode/mui';
            createMuiNode('div', { padding: 1 });
            isProbablyMuiTheme({ padding: 1 });
            "#,
            &mui_config(),
        );
        assert_eq!(decisions, vec![]);
    }

    #[test]
    fn configured_module_import_without_config_is_ignored() {
        // Same source as `capitalized_import_from_configured_module_is_compilable`,
        // but with the default (empty) config — Change 4 is opt-in.
        let decisions = decisions_for(
            r#"
            import { Button } from '@meonode/mui';
            Button({ padding: 1 });
            "#,
        );
        assert_eq!(decisions, vec![]);
    }

    #[test]
    fn unconfigured_module_is_ignored_even_with_other_modules_configured() {
        let decisions = decisions_for_with_config(
            r#"
            import { Button } from '@meonode/other-lib';
            Button({ padding: 1 });
            "#,
            &mui_config(),
        );
        assert_eq!(decisions, vec![]);
    }

    #[test]
    fn namespace_import_from_configured_module_bails() {
        let decisions = decisions_for_with_config(
            r#"
            import * as Mui from '@meonode/mui';
            Mui.Button({ padding: 1 });
            "#,
            &mui_config(),
        );
        assert_eq!(decisions, vec![Decision::Bail(BailReason::NamespaceImport)]);
    }

    #[test]
    fn non_object_literal_arg_from_configured_module_bails() {
        // Misidentification must degrade to a bail, never a rewrite: a
        // non-object-literal first argument is never rewritten, exactly like
        // any other factory.
        let decisions = decisions_for_with_config(
            r#"
            import { Button } from '@meonode/mui';
            const props = { padding: 1 };
            Button(props);
            "#,
            &mui_config(),
        );
        assert_eq!(
            decisions,
            vec![Decision::Bail(BailReason::NotObjectLiteral)]
        );
    }

    #[test]
    fn aliased_capitalized_import_from_configured_module_is_compilable() {
        let decisions = decisions_for_with_config(
            r#"
            import { Button as MuiButton } from '@meonode/mui';
            MuiButton({ padding: 1 });
            "#,
            &mui_config(),
        );
        assert_eq!(decisions, vec![Decision::Compilable { props_arg_idx: 0 }]);
    }

    #[test]
    fn multiple_configured_factory_modules_are_all_tracked() {
        let config = CompileConfig {
            factory_modules: vec!["@meonode/mui".to_string(), "@acme/widgets".to_string()],
        };
        let decisions = decisions_for_with_config(
            r#"
            import { Button } from '@meonode/mui';
            import { Widget } from '@acme/widgets';
            Button({ padding: 1 });
            Widget({ padding: 2 });
            "#,
            &config,
        );
        assert_eq!(
            decisions,
            vec![
                Decision::Compilable { props_arg_idx: 0 },
                Decision::Compilable { props_arg_idx: 0 },
            ]
        );
    }

    // ---- `children` origin: generated ------------------------------------
    //
    // None of these is matched by a rule of its own. They are generated
    // because they are not one of the authored shapes, which is the whole
    // point of inverting the test: the list below could go on forever and
    // the classifier would not need another line.

    #[test]
    fn map_call_children_are_generated() {
        assert_children("items.map(fn)", ChildrenOrigin::Generated);
    }

    #[test]
    fn spread_of_map_call_children_are_generated() {
        assert_children("[...items.map(fn)]", ChildrenOrigin::Generated);
    }

    #[test]
    fn immediately_invoked_arrow_children_are_generated() {
        assert_children("(() => items.map(fn))()", ChildrenOrigin::Generated);
    }

    #[test]
    fn filtered_then_mapped_children_are_generated() {
        assert_children("items.filter(Boolean).map(fn)", ChildrenOrigin::Generated);
    }

    #[test]
    fn flat_map_children_are_generated() {
        assert_children("items.flatMap(fn)", ChildrenOrigin::Generated);
    }

    #[test]
    fn array_from_children_are_generated() {
        assert_children("Array.from({ length: 3 }, fn)", ChildrenOrigin::Generated);
    }

    #[test]
    fn object_values_mapped_children_are_generated() {
        assert_children("Object.values(byId).map(fn)", ChildrenOrigin::Generated);
    }

    #[test]
    fn reduce_children_are_generated() {
        assert_children("items.reduce(step, [])", ChildrenOrigin::Generated);
    }

    /// A bare identifier: whatever built it, it was not this call site.
    #[test]
    fn identifier_children_are_generated() {
        assert_children("rows", ChildrenOrigin::Generated);
    }

    /// Shorthand `{ children }` is the same read, written shorter.
    #[test]
    fn shorthand_children_are_generated() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ children })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    /// A spread inside an otherwise hand-written array: its length is a
    /// runtime fact, so every slot after it moves when it does.
    #[test]
    fn array_with_spread_children_are_generated() {
        assert_children("[Header(), ...rows]", ChildrenOrigin::Generated);
    }

    /// Both branches are hand-written arrays, but of different lengths, so
    /// which child sits at index 1 is a runtime fact. The classifier never
    /// looks inside a ternary — it is not an array literal, so it is
    /// generated, and this case needs no rule.
    #[test]
    fn ternary_between_arrays_children_are_generated() {
        assert_children(
            "cond ? [A(), B(), C()] : [A(), C()]",
            ChildrenOrigin::Generated,
        );
    }

    /// The accepted false positive: a helper returning hand-written children
    /// is opaque here, so it is called generated and its caller is asked for
    /// keys it does not need. React's transform is wrong in exactly the same
    /// direction, for exactly the same reason.
    #[test]
    fn helper_call_children_are_generated() {
        assert_children("buildRows()", ChildrenOrigin::Generated);
    }

    // ---- `children` origin: authored -------------------------------------

    #[test]
    fn array_of_factory_calls_children_are_authored() {
        assert_children("[A(), B(), C()]", ChildrenOrigin::Authored);
    }

    /// A conditional *slot* is still a slot the author wrote: `cond && B()`
    /// renders nothing when false but never changes which index it occupies,
    /// so position stays as stable as the source text.
    #[test]
    fn array_with_conditional_slot_children_are_authored() {
        assert_children("[A(), cond && B(), C()]", ChildrenOrigin::Authored);
    }

    /// A call to a tracked factory binding returns one node, never an array.
    /// The inner `Section({})` is a call site in its own right, so two
    /// origins are recorded; it has no `children`, so it is authored too.
    #[test]
    fn single_factory_call_child_is_authored() {
        let src = r#"
            import { Div, Section } from '@meonode/ui'
            Div({ children: Section({}) })
        "#;
        assert_eq!(
            children_origins_for(src),
            vec![ChildrenOrigin::Authored, ChildrenOrigin::Authored]
        );
    }

    #[test]
    fn text_children_are_authored() {
        assert_children("'hi'", ChildrenOrigin::Authored);
    }

    #[test]
    fn single_element_array_children_are_authored() {
        assert_children("[A()]", ChildrenOrigin::Authored);
    }

    /// A call site with no `children` at all has no list to report on.
    #[test]
    fn absent_children_are_authored() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ padding: 8 })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Authored]);
    }

    // ---- boundaries of the two questions ---------------------------------

    /// `Section({})` is itself a call site, so the inner one is recorded
    /// too. Traversal is outer-first (`visit_call_expr` classifies before it
    /// recurses), and the inner call has no `children` of its own.
    #[test]
    fn nested_factory_call_records_both_call_sites() {
        let src = r#"
            import { Div, Section } from '@meonode/ui'
            Div({ children: Section({ children: items.map(fn) }) })
        "#;
        assert_eq!(
            children_origins_for(src),
            vec![ChildrenOrigin::Authored, ChildrenOrigin::Generated]
        );
    }

    /// The origin is recorded independently of whether the props can be
    /// partitioned: a `KeyOnly` call site still emits a marker, so the flag
    /// has to reach it. A numeric key forces `KeyOnly` here.
    #[test]
    fn key_only_call_site_still_records_generated_children() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ 0: 'x', children: items.map(fn) })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::KeyOnly { props_arg_idx: 0 }]
        );
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    /// A computed key sitting *after* `children` must not reach
    /// `keys::key_name_atom`, whose contract is "only ever called on an
    /// already-validated key" and which panics otherwise. `validate_object`
    /// stops at the first disqualifying prop, so nothing upstream guarantees
    /// the rest of the object is clean.
    #[test]
    fn computed_key_after_children_does_not_panic() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ children: items.map(fn), [k]: 1 })
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Bail(BailReason::ComputedKey)]
        );
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    /// A repeated key resolves the way the object literal itself does: the
    /// last one wins, so the first `children` must not decide the answer.
    #[test]
    fn duplicate_children_keys_take_the_last_one() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div({ children: ['a'], children: items.map(fn) })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    /// A shadowed local named like a factory is not a factory, so a call to
    /// it is opaque — the same binding-based test the rest of this module
    /// uses, applied to the `children` value.
    #[test]
    fn shadowed_factory_call_child_is_generated() {
        let src = r#"
            import { Div } from '@meonode/ui'
            const Section = () => buildRows()
            Div({ children: Section({}) })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    // ---- children-first factories: the children are argument 0 ----------
    //
    // `createChildrenFirstNode` builds `(children, props, deps) =>
    // Node(element, { ...initialProps, ...props, children }, deps)`, so
    // argument 0 is merged in last and is the only children that survive.
    // The classification is the same rule, read from a different place.

    /// Asserts that `children_arg`, written as argument 0 of a `Span` call
    /// that also has a props object, classifies as `expected`.
    fn assert_children_first(children_arg: &str, expected: ChildrenOrigin) {
        let src = format!(
            "import {{ Span, Section }} from '@meonode/ui'\nSpan({children_arg}, {{ padding: 8 }})"
        );
        assert_eq!(
            children_origins_for(&src),
            vec![expected],
            "Span({children_arg}, ...)"
        );
    }

    #[test]
    fn children_first_map_call_arg_is_generated() {
        assert_children_first("items.map(fn)", ChildrenOrigin::Generated);
    }

    #[test]
    fn children_first_identifier_arg_is_generated() {
        assert_children_first("rows", ChildrenOrigin::Generated);
    }

    #[test]
    fn children_first_array_with_spread_arg_is_generated() {
        assert_children_first("[Header(), ...rows]", ChildrenOrigin::Generated);
    }

    #[test]
    fn children_first_array_arg_is_authored() {
        assert_children_first("['a', 'b']", ChildrenOrigin::Authored);
    }

    #[test]
    fn children_first_text_arg_is_authored() {
        assert_children_first("'hi'", ChildrenOrigin::Authored);
    }

    /// A local factory derived from `createChildrenFirstNode` reads argument
    /// 0 the same way a named HTML factory does.
    #[test]
    fn derived_children_first_factory_reads_arg_zero() {
        let src = r#"
            import { createChildrenFirstNode } from '@meonode/ui'
            const List = createChildrenFirstNode('ul')
            List(items.map(fn), { padding: 8 })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    /// Argument 0 is merged in *after* `...props`, so it wins; the props type
    /// declares `children?: never` for exactly this reason. Reading the props
    /// object here would classify a value the runtime discards.
    #[test]
    fn children_first_arg_zero_wins_over_a_children_prop() {
        let src = r#"
            import { Span } from '@meonode/ui'
            Span(rows, { children: ['a'] })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    /// The same override in the other direction: a dead `children` prop must
    /// not mark a call site whose real children were written out.
    #[test]
    fn children_first_dead_children_prop_does_not_mark_the_call_site() {
        let src = r#"
            import { Span } from '@meonode/ui'
            Span(['a'], { children: rows })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Authored]);
    }

    /// `Span()` passes `children: undefined` — no list at all.
    #[test]
    fn children_first_with_no_arguments_is_authored() {
        let src = r#"
            import { Span } from '@meonode/ui'
            Span()
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Authored]);
    }

    /// A children-first call with no props object still has somewhere to put
    /// the marker: `partition.rs` appends the argument. The props position is
    /// exactly one past the last written argument here, so nothing is
    /// displaced.
    #[test]
    fn children_first_without_a_props_object_synthesizes_one() {
        let src = r#"
            import { Span } from '@meonode/ui'
            Span(items.map(fn))
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::SynthesizeProps { props_arg_idx: 1 }]
        );
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    /// The converse, and the reason synthesis is gated on the origin rather
    /// than on the missing argument: a call site with nothing to report is
    /// left exactly as the author wrote it, arity included.
    #[test]
    fn children_first_without_props_and_authored_children_is_left_alone() {
        let src = r#"
            import { Span } from '@meonode/ui'
            Span(['a', 'b'])
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Bail(BailReason::MissingPropsArg)]
        );
    }

    /// A props argument that *was* written but isn't an object literal is
    /// never synthesized over — replacing it would discard a value the author
    /// wrote. `Span(rows, maybeProps)` bails as it always did.
    #[test]
    fn children_first_with_a_non_literal_props_argument_is_not_synthesized() {
        let src = r#"
            import { Span } from '@meonode/ui'
            Span(rows, maybeProps)
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Bail(BailReason::NotObjectLiteral)]
        );
    }

    /// A props-first factory can never reach synthesis: its children live in
    /// the props object, so a missing props argument means missing children.
    #[test]
    fn props_first_factory_with_no_arguments_is_not_synthesized() {
        let src = r#"
            import { Div } from '@meonode/ui'
            Div()
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Bail(BailReason::MissingPropsArg)]
        );
    }

    /// `Node(element, props, deps)` likewise: argument 0 is an element, never
    /// children, so `Node(El)` has nothing to report and keeps its arity.
    #[test]
    fn node_factory_with_only_an_element_is_not_synthesized() {
        let src = r#"
            import { Node } from '@meonode/ui'
            Node(El)
        "#;
        assert_eq!(
            decisions_for(src),
            vec![Decision::Bail(BailReason::MissingPropsArg)]
        );
    }

    /// `Node(element, props, deps)` is props-first: its argument 0 is the
    /// element, so the props object stays the source of children.
    #[test]
    fn node_factory_reads_children_from_props_not_arg_zero() {
        let src = r#"
            import { Node } from '@meonode/ui'
            Node(El, { children: items.map(fn) })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Generated]);
    }

    /// The converse, which is what would break if argument 0 were read for
    /// every factory taking props at index 1: `Node`'s argument 0 is an
    /// element and must never be classified as children.
    #[test]
    fn node_factory_ignores_arg_zero_when_classifying() {
        let src = r#"
            import { Node } from '@meonode/ui'
            Node(rows, { children: ['a'] })
        "#;
        assert_eq!(children_origins_for(src), vec![ChildrenOrigin::Authored]);
    }
}
