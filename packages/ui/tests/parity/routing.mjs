// Checks a case's `routing` against the "on" side's compiled output: each
// routed node is found by its `key` prop and must carry the markers of its
// route, whole: a named node its class name (`__meo$n`), a templated one its
// template (`__meo$t`), neither keeping style of its own in the call, and a
// carrier also its mark (`__meo$r`), which a plain named node lacks; a joined
// one is the props of an imported factory's call the runtime joins and names
// (`__meoFactoryCall(X, site, props)`); a runtime one no name, template or
// join. The routes come from the design, in inventory.mjs.
//
// A name proves nothing on its own, so `registrationProblems` also checks that
// every name and template a case's output uses is registered with text.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PACKAGE } from './build.mjs'

const require = createRequire(join(PACKAGE, 'package.json'))

/** The props that name an extracted node: its class name, or its template and the values that fill it. */
const NAMED = ['__meo$n', '__meo$t']
/** The fingerprint on a layout factory's call whose initial props the compiler merged. */
const MERGED = '__meo$i'
/** The helper an imported factory's call is joined through at run time. */
const FACTORY_CALL = '__meoFactoryCall'
/** The exports a compiled module registers its names' rules and its templates' text with. */
const REGISTER_CSS = 'registerStaticCss'
const REGISTER_TEMPLATE = 'registerStaticTemplate'
/** The mark on a named or templated node that inserts the run of named rules starting with its own. */
const CARRIER = '__meo$r'

/** A property key's name, or null for a computed key. */
function keyName(key) {
  if (key.type === 'Identifier' || key.type === 'StringLiteral') return key.value
  return null
}

/** Every object literal in an AST, depth first. */
function* objects(node) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const n of node) yield* objects(n)
    return
  }
  if (node.type === 'ObjectExpression') yield node
  for (const value of Object.values(node)) if (value && typeof value === 'object') yield* objects(value)
}

/** The object literal whose `key` prop is this string literal. */
function findNode(ast, key) {
  for (const object of objects(ast)) {
    const own = object.properties.find(p => p.type === 'KeyValueProperty' && keyName(p.key) === 'key')
    if (own?.value.type === 'StringLiteral' && own.value.value === key) return object
  }
  return null
}

/** Every node of an AST, depth first. */
function* nodes(node) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const n of node) yield* nodes(n)
    return
  }
  if (node.type) yield node
  for (const value of Object.values(node)) if (value && typeof value === 'object') yield* nodes(value)
}

/** The local name a call's callee is written as, or null. */
const calleeName = call => (call.callee?.type === 'Identifier' ? call.callee.value : null)

/** The object literals passed as props to a joined factory call. */
function joinedProps(ast) {
  const out = new Set()
  for (const n of nodes(ast)) {
    if (n.type !== 'CallExpression' || calleeName(n) !== FACTORY_CALL) continue
    for (const arg of n.arguments) if (arg.expression?.type === 'ObjectExpression') out.add(arg.expression)
  }
  return out
}

/** The local names `exported` is imported as, from any module. */
function localNames(ast, exported) {
  const out = new Set([exported])
  for (const n of nodes(ast)) {
    if (n.type !== 'ImportSpecifier') continue
    const imported = n.imported?.value ?? n.local.value
    if (imported === exported) out.add(n.local.value)
  }
  return out
}

/** The string literals an expression can evaluate to: itself, or the branches of conditionals. */
function literalsOf(expr, out = []) {
  if (!expr) return out
  if (expr.type === 'StringLiteral') out.push(expr.value)
  else if (expr.type === 'ConditionalExpression') {
    literalsOf(expr.consequent, out)
    literalsOf(expr.alternate, out)
  } else if (expr.type === 'ParenthesisExpression') literalsOf(expr.expression, out)
  else out.push(null)
  return out
}

/** Each class name a module graph registers, with its rule text. */
function registeredRules(ast) {
  const calls = localNames(ast, REGISTER_CSS)
  const rules = new Map()
  for (const n of nodes(ast)) {
    const list = n.type === 'CallExpression' && calls.has(calleeName(n)) ? n.arguments[1]?.expression : null
    if (list?.type !== 'ArrayExpression') continue
    for (const pair of list.elements) {
      const [named, text] = pair?.expression?.type === 'ArrayExpression' ? pair.expression.elements.map(e => e?.expression) : []
      if (named?.type === 'StringLiteral') rules.set(named.value, text?.type === 'StringLiteral' ? text.value : '')
    }
  }
  return rules
}

/** Each template id a module graph registers, with its text. */
function registeredTemplates(ast) {
  const calls = localNames(ast, REGISTER_TEMPLATE)
  const templates = new Map()
  for (const n of nodes(ast)) {
    if (n.type !== 'CallExpression' || !calls.has(calleeName(n))) continue
    const [id, list] = n.arguments.map(a => a.expression)
    if (id?.type === 'StringLiteral' && list?.type === 'ArrayExpression')
      templates.set(id.value, list.elements.map(e => (e?.expression?.type === 'StringLiteral' ? e.expression.value : '')).join(''))
  }
  return templates
}

/** The array literals a `__meo$t` value can evaluate to: itself, or the branches of conditionals; null for anything else. */
function templatesOf(expr, out = []) {
  if (expr?.type === 'ArrayExpression') out.push(expr)
  else if (expr?.type === 'ConditionalExpression') {
    templatesOf(expr.consequent, out)
    templatesOf(expr.alternate, out)
  } else if (expr?.type === 'ParenthesisExpression') templatesOf(expr.expression, out)
  else out.push(null)
  return out
}

/**
 * The registration problems of one case's "on" output: every class name a
 * node carries (`__meo$n`, each branch of a conditional) must be registered
 * with non-empty rule text, and every template a node fills (`__meo$t`) with
 * non-empty text, in the case's module or a part it imports.
 * @returns One line per problem.
 */
export function registrationProblems(name, code) {
  const { parseSync } = require('@swc/core')
  const ast = parseSync(code, { syntax: 'ecmascript' })
  const rules = registeredRules(ast)
  const templates = registeredTemplates(ast)
  const problems = []
  for (const n of nodes(ast)) {
    if (n.type !== 'KeyValueProperty') continue
    const key = keyName(n.key)
    if (key === NAMED[0]) {
      for (const cls of literalsOf(n.value)) {
        if (cls === null) problems.push(`${name}: a ${NAMED[0]} that is not a literal or a conditional of literals`)
        else if (!rules.get(cls)) problems.push(`${name}: class ${cls} is named, but no rule text is registered for it`)
      }
    }
    if (key === NAMED[1]) {
      // A template, or a conditional between templates when the node switches.
      for (const filled of templatesOf(n.value)) {
        const id = filled?.elements[0]?.expression
        if (id?.type !== 'StringLiteral') problems.push(`${name}: a ${NAMED[1]} whose template id is not a literal`)
        else if (!templates.get(id.value)) problems.push(`${name}: template ${id.value} is filled, but no text is registered for it`)
      }
    }
  }
  return problems
}

/** The markers a routed node must and must not carry, by route; `joined` for a joined call's props. */
// The carrier mark is checked apart from these: a node carries it exactly when
// its route is CARRIER or its claim says `carrier: true` (a themed or merged
// carrier keeps its own route).
const MUST = {
  NAMED: { carry: [['__meo$n']], not: ['__meo$t', '__meo$c', 'css'] },
  NAMED_THEMED: { carry: [['__meo$n']], not: ['__meo$t', '__meo$c', 'css'], themed: true },
  CARRIER: { carry: [NAMED], not: ['__meo$c', 'css'] },
  TEMPLATE: { carry: [['__meo$t']], not: ['__meo$n', '__meo$c', 'css'] },
  FACTORY_MERGED: { carry: [[MERGED], NAMED], not: ['__meo$c', 'css'] },
  JOINED: { joined: true },
}

/**
 * The routing problems of one case on the "on" side: each routed node must
 * carry the markers its route requires and none it rules out. A runtime route
 * rules out a name, a template and a joined call; an extracted one requires
 * the name or template (a joined call: being one), and NAMED_THEMED a
 * registered rule holding the theme token.
 * @param name The case's name, for reports.
 * @param routing The case's `meta.routing`.
 * @param code Its compiled "on" output.
 * @returns One line per problem; empty when every node is routed as listed.
 */
export function routingProblems(name, routing, code) {
  if (!routing?.length) return []
  const { parseSync } = require('@swc/core')
  const ast = parseSync(code, { syntax: 'ecmascript' })
  const joined = joinedProps(ast)
  const rules = registeredRules(ast)
  const problems = []
  for (const { node, route, carrier = false } of routing) {
    const object = findNode(ast, node)
    if (!object) {
      problems.push(`${name} node ${node} (${route}): no object literal with this key in the "on" output`)
      continue
    }
    const own = new Set(object.properties.filter(p => p.type === 'KeyValueProperty').map(p => keyName(p.key)))
    const isJoined = joined.has(object)
    const rule = MUST[route]
    // The carrier mark, on every route: required of a carrier, ruled out on every other node.
    const marked = route === 'CARRIER' || carrier
    if (marked && !own.has(CARRIER)) problems.push(`${name} node ${node} (${route}${carrier ? ', carrier' : ''}): the node carries no ${CARRIER}`)
    if (!marked && own.has(CARRIER)) problems.push(`${name} node ${node} (${route}): the node carries ${CARRIER}, but it is no carrier`)
    if (!rule) {
      // A runtime route: the whole node on the runtime path.
      for (const marker of NAMED) if (own.has(marker)) problems.push(`${name} node ${node} (${route}): a runtime route, but the node carries ${marker}`)
      if (isJoined) problems.push(`${name} node ${node} (${route}): a runtime route, but the node is a joined factory call`)
      continue
    }
    if (rule.joined) {
      if (!isJoined) problems.push(`${name} node ${node} (${route}): the node is no joined factory call`)
      continue
    }
    for (const any of rule.carry) if (!any.some(m => own.has(m))) problems.push(`${name} node ${node} (${route}): the node carries no ${any.join(' or ')}`)
    for (const m of rule.not) if (own.has(m)) problems.push(`${name} node ${node} (${route}): the node carries ${m}`)
    if (rule.themed) {
      const named = object.properties.find(p => p.type === 'KeyValueProperty' && keyName(p.key) === NAMED[0])
      const texts = named ? literalsOf(named.value).map(cls => rules.get(cls) ?? '') : []
      if (!texts.some(t => t.includes('theme.'))) problems.push(`${name} node ${node} (${route}): no registered rule of the node holds a theme token`)
    }
  }
  return problems
}
