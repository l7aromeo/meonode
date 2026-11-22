//! Calls of imported factories: `X(props)` becomes
//! `__meoFactoryCall(X, __meoSiteN, props)`.
//!
//! A factory imported from another module may hold `createNode` defaults this
//! module cannot read, so its call's style is joined at run time: the runtime
//! checks that `X` is a `createNode` or `createChildrenFirstNode` factory, and
//! joins its defaults with the call's style once per site, naming the result as
//! a compiled style is named. Anything else, or a call the runtime cannot join,
//! is made as written, `X(...args)`, with the arguments evaluated once and in
//! order, so the rewrite is exact whatever `X` is.
//!
//! The rewrite applies to a direct call of an imported identifier written with
//! a capital, given no arguments or a props object literal whose style (its CSS
//! props and `css`) is made of literals, so it is the same on every render:
//! the site stands for that style. Left as written: member calls, calls with a
//! spread argument, identifiers the module renders as JSX elements (components),
//! imports from `@meonode/` packages, calls not in node position (see
//! [`Positions`]: a font loader's module-scope call, say), props with a spread or a
//! computed key, and props holding `theme`, `as` or `disableEmotion`. The
//! helper comes from `@meonode/ui/factory-call`, which imports nothing, so a
//! module that loads no other part of the runtime gains no React or Emotion.
//!
//! Each site is a module-level object, `{ at }`: the index of the argument the
//! call's props are, which the runtime compares with the factory's own (`1` for
//! `createChildrenFirstNode`), plus `r: 1` where the carrier pass marks the
//! node a carrier (see [`crate::carrier`]), as it would a named node there.
use std::collections::{HashMap, HashSet};

use swc_core::common::{DUMMY_SP, Span, SyntaxContext};
use swc_core::ecma::ast::*;
use swc_core::ecma::atoms::Atom;
use swc_core::ecma::visit::{Visit, VisitMut, VisitMutWith, VisitWith};

use crate::css_props::is_css_prop;
use crate::detect::ChildrenOrigin;
use crate::extract::ModuleScope;
use crate::keys::{is_special_key, plain_key};
use crate::pass_through::unwrap_transparent;

/// The runtime's export, and its local name in compiled output.
pub const FACTORY_CALL_EXPORT: &str = "__meoFactoryCall";
pub const FACTORY_CALL_LOCAL: &str = "__meoFactoryCall";
/// The subpath it is imported from: a module that imports nothing, so a module
/// that loads no other part of `@meonode/ui` gains no React or Emotion.
pub const FACTORY_CALL_MODULE: &str = "@meonode/ui/factory-call";
/// The prefix of each site's module-level binding, followed by its index.
pub const SITE_PREFIX: &str = "__meoSite";

/// The key holding a node's children.
const CHILDREN: &str = "children";
/// The method that renders a node, and the root's that renders a tree.
const RENDER: &str = "render";

/// Props whose presence the runtime refuses to join over.
const REFUSED_PROPS: &[&str] = &["theme", "as", "disableEmotion"];

/// One rewritten call's site.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FactorySite {
    /// The index of the call's props among its arguments.
    pub at: usize,
    /// Whether the node is a carrier.
    pub carrier: bool,
}

/// The module's sites, in order, and which call each belongs to.
#[derive(Debug, Default)]
pub struct FactorySites {
    pub sites: Vec<FactorySite>,
    /// A rewritten call's span (as the carrier pass keys calls) to its site.
    pub by_span: HashMap<(u32, u32), usize>,
}

impl FactorySites {
    pub fn is_empty(&self) -> bool {
        self.sites.is_empty()
    }

    /// The site of a rewritten call, by the call's span.
    pub fn site_of(&self, call: &CallExpr) -> Option<&FactorySite> {
        self.by_span
            .get(&(call.span.lo.0, call.span.hi.0))
            .map(|&index| &self.sites[index])
    }
}

/// The binding name of site `index`.
pub fn site_name(index: usize) -> String {
    format!("{SITE_PREFIX}{index}")
}

/// Rewrites every eligible call in `module`, returning their sites.
///
/// `marked` holds the calls the compiler marks as factory calls with
/// extraction off (`factoryModules` imports), by span. A rewritten one has its
/// props stamped by `stamp` as a call site that is not partitioned, with the
/// same marks (generated children's above all): whichever way the runtime
/// makes the call, it gets the props it gets with extraction off.
pub fn rewrite(
    module: &mut Module,
    scope: &ModuleScope,
    marked: &HashMap<(u32, u32), ChildrenOrigin>,
    stamp: &dyn Fn(&mut ObjectLit, Span, ChildrenOrigin),
) -> FactorySites {
    let mut positions = Positions::default();
    module.visit_with(&mut positions);
    let mut rewriter = Rewriter {
        scope,
        positions: positions.0,
        marked,
        stamp,
        sites: FactorySites::default(),
    };
    module.visit_mut_with(&mut rewriter);
    rewriter.sites
}

/// The spans of the calls in node position: where what the call returns is
/// rendered, so the call builds a node. A return, an arrow's body, a
/// `children` value, a children-first call's children, and what `.render()`
/// is called on or given; through parentheses, arrays, conditionals and the
/// logical operators' operands that can be the result. A call anywhere else
/// (a constant, another call's argument) may be anything: a font loader Next
/// compiles only as written, say, so it stays as written.
#[derive(Default)]
struct Positions(HashSet<(u32, u32)>);

impl Positions {
    fn mark(&mut self, expr: &Expr) {
        match unwrap_transparent(expr) {
            Expr::Call(call) => {
                self.0.insert((call.span.lo.0, call.span.hi.0));
            }
            Expr::Cond(cond) => {
                self.mark(&cond.cons);
                self.mark(&cond.alt);
            }
            Expr::Bin(bin) => match bin.op {
                BinaryOp::LogicalAnd => self.mark(&bin.right),
                BinaryOp::LogicalOr | BinaryOp::NullishCoalescing => {
                    self.mark(&bin.left);
                    self.mark(&bin.right);
                }
                _ => {}
            },
            Expr::Array(array) => {
                for elem in array.elems.iter().flatten() {
                    self.mark(&elem.expr);
                }
            }
            _ => {}
        }
    }
}

impl Visit for Positions {
    fn visit_return_stmt(&mut self, ret: &ReturnStmt) {
        if let Some(arg) = &ret.arg {
            self.mark(arg);
        }
        ret.visit_children_with(self);
    }

    fn visit_arrow_expr(&mut self, arrow: &ArrowExpr) {
        if let ArrowFunctionBody::Expr(body) = &*arrow.body {
            self.mark(body);
        }
        arrow.visit_children_with(self);
    }

    fn visit_key_value_prop(&mut self, kv: &KeyValueProp) {
        if plain_key(&kv.key).is_some_and(|key| key.as_ref() == CHILDREN) {
            self.mark(&kv.value);
        }
        kv.visit_children_with(self);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Callee::Expr(callee) = &call.callee {
            match &**callee {
                Expr::Member(member) if matches!(&member.prop, MemberProp::Ident(prop) if prop.sym.as_ref() == RENDER) =>
                {
                    self.mark(&member.obj);
                    for arg in &call.args {
                        self.mark(&arg.expr);
                    }
                }
                // A children-first call (a capitalized callee given its props
                // second): its first argument is its children.
                Expr::Ident(id)
                    if id.sym.starts_with(|c: char| c.is_ascii_uppercase())
                        && props_position(&call.args) == Some(1) =>
                {
                    self.mark(&call.args[0].expr);
                }
                _ => {}
            }
        }
        call.visit_children_with(self);
    }
}

struct Rewriter<'a> {
    scope: &'a ModuleScope,
    /// See [`Positions`].
    positions: HashSet<(u32, u32)>,
    /// See [`rewrite`].
    marked: &'a HashMap<(u32, u32), ChildrenOrigin>,
    stamp: &'a dyn Fn(&mut ObjectLit, Span, ChildrenOrigin),
    sites: FactorySites,
}

impl VisitMut for Rewriter<'_> {
    fn visit_mut_call_expr(&mut self, call: &mut CallExpr) {
        call.visit_mut_children_with(self);
        let Callee::Expr(callee) = &call.callee else {
            return;
        };
        let Expr::Ident(id) = &**callee else {
            return;
        };
        if !id.sym.starts_with(|c: char| c.is_ascii_uppercase())
            || !self.scope.is_imported_callee(&id.sym, id.ctxt)
            || !self.positions.contains(&(call.span.lo.0, call.span.hi.0))
        {
            return;
        }
        let Some(at) = props_position(&call.args) else {
            return;
        };
        let callee = Expr::Ident(id.clone());
        if let Some(&children) = self.marked.get(&(call.span.lo.0, call.span.hi.0))
            && let Some(arg) = call.args.get_mut(at)
            && let Expr::Object(props) = unwrap_parens_mut(&mut arg.expr)
        {
            (self.stamp)(props, call.span, children);
        }
        let index = self.sites.sites.len();
        self.sites.sites.push(FactorySite { at, carrier: false });
        self.sites
            .by_span
            .insert((call.span.lo.0, call.span.hi.0), index);
        let args = std::mem::take(&mut call.args);
        call.callee = Callee::Expr(Box::new(Expr::Ident(Ident::new(
            Atom::from(FACTORY_CALL_LOCAL),
            DUMMY_SP,
            SyntaxContext::empty(),
        ))));
        call.args = [
            callee,
            Expr::Ident(Ident::new(
                Atom::from(site_name(index)),
                DUMMY_SP,
                SyntaxContext::empty(),
            )),
        ]
        .into_iter()
        .map(|expr| ExprOrSpread {
            spread: None,
            expr: Box::new(expr),
        })
        .chain(args)
        .collect();
    }
}

/// The index of the call's props argument, when the call is one the rewrite
/// takes: no arguments (`0`), or a props object literal first, or second after
/// a first argument that is not one (a children-first call's children). Two
/// leading object literals could be either order, so neither is taken.
fn props_position(args: &[ExprOrSpread]) -> Option<usize> {
    if args.iter().any(|arg| arg.spread.is_some()) {
        return None;
    }
    let object = |at: usize| {
        args.get(at)
            .and_then(|arg| match unwrap_transparent(&arg.expr) {
                Expr::Object(obj) => Some(obj),
                _ => None,
            })
    };
    let at = match (object(0), object(1)) {
        _ if args.is_empty() => return Some(0),
        (Some(_), Some(_)) => return None,
        (Some(_), None) => 0,
        (None, Some(_)) => 1,
        (None, None) => return None,
    };
    object(at).filter(|props| static_style(props)).map(|_| at)
}

/// Whether the props' style is the same on every render: every CSS prop and
/// `css` written as a literal, and nothing that may hold style (a spread, a
/// computed key) or that the runtime refuses to join over.
fn static_style(props: &ObjectLit) -> bool {
    props.props.iter().all(|prop| {
        let PropOrSpread::Prop(prop) = prop else {
            return false;
        };
        let (name, value) = match &**prop {
            Prop::KeyValue(kv) => match plain_key(&kv.key) {
                Some(key) => (key, Some(&*kv.value)),
                // A computed key may name a style prop; a numeric one is left
                // to the runtime, as the compiler's own merge leaves it.
                None => return false,
            },
            Prop::Shorthand(id) => (id.sym.clone(), None),
            _ => return false,
        };
        let name = name.as_ref();
        if REFUSED_PROPS.contains(&name) {
            return false;
        }
        let style = name == "css" || (is_css_prop(name) && !is_special_key(name));
        // A shorthand's value is an identifier read, which may change.
        !style || value.is_some_and(literal)
    })
}

/// `expr` without its parentheses.
fn unwrap_parens_mut(mut expr: &mut Expr) -> &mut Expr {
    while let Expr::Paren(paren) = expr {
        expr = &mut paren.expr;
    }
    expr
}

/// A literal: a string, a number, a boolean, `null`, `undefined`, a template
/// with no holes, or an object of those.
fn literal(expr: &Expr) -> bool {
    match unwrap_transparent(expr) {
        Expr::Lit(_) => true,
        Expr::Ident(id) => id.sym.as_ref() == "undefined",
        Expr::Unary(UnaryExpr {
            op: UnaryOp::Minus,
            arg,
            ..
        }) => matches!(unwrap_transparent(arg), Expr::Lit(Lit::Num(_))),
        Expr::Tpl(tpl) => tpl.exprs.is_empty(),
        Expr::Object(obj) => obj.props.iter().all(|prop| match prop {
            PropOrSpread::Prop(prop) => match &**prop {
                Prop::KeyValue(kv) => {
                    !matches!(kv.key, PropName::Computed(_)) && literal(&kv.value)
                }
                _ => false,
            },
            PropOrSpread::Spread(_) => false,
        }),
        _ => false,
    }
}
