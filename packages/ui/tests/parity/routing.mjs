// Checks a case's `routing` against the "on" side's compiled output: each
// named node is found by its `key` prop, and its object literal must still
// hold the properties listed as runtime and no longer hold those listed as
// extracted, which must have left for a class in `__meo$s`. A node routed
// `whole` must carry no `__meo$s` or `__meo$v` at all.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PACKAGE } from './build.mjs'

const require = createRequire(join(PACKAGE, 'package.json'))

/** The prop holding a node's children, whose nodes are checked on their own. */
const CHILDREN = 'children'
/** The prop the compiler writes extracted classes to. */
const CLASSES = '__meo$s'
/** The prop the compiler writes extracted values' variables to. */
const VARIABLES = '__meo$v'

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

/** The keys an object literal holds, nested objects included, its children left out. */
function keysOf(object, out = new Set()) {
  for (const prop of object.properties) {
    if (prop.type !== 'KeyValueProperty') continue
    const name = keyName(prop.key)
    if (name === CHILDREN) continue
    if (name !== null) out.add(name)
    for (const inner of objects(prop.value)) if (inner !== object) keysOf(inner, out)
  }
  return out
}

/** The object literal whose `key` prop is this string literal. */
function findNode(ast, key) {
  for (const object of objects(ast)) {
    const own = object.properties.find(p => p.type === 'KeyValueProperty' && keyName(p.key) === 'key')
    if (own?.value.type === 'StringLiteral' && own.value.value === key) return object
  }
  return null
}

/**
 * The routing problems of one case on the "on" side.
 * @param name The case's name, for reports.
 * @param routing The case's `meta.routing`.
 * @param code Its compiled "on" output.
 * @returns One line per problem; empty when every node is routed as listed.
 */
export function routingProblems(name, routing, code) {
  if (!routing?.length) return []
  const { parseSync } = require('@swc/core')
  const ast = parseSync(code, { syntax: 'ecmascript' })
  const problems = []
  for (const { node, route, runtime = [], extracted = [], whole = false } of routing) {
    const object = findNode(ast, node)
    if (!object) {
      problems.push(`${name} node ${node} (${route}): no object literal with this key in the "on" output`)
      continue
    }
    const keys = keysOf(object)
    for (const prop of runtime) if (!keys.has(prop)) problems.push(`${name} node ${node} (${route}): ${prop} should stay on the runtime path, but it left the call`)
    for (const prop of extracted) if (keys.has(prop)) problems.push(`${name} node ${node} (${route}): ${prop} should be extracted, but it is still in the call`)
    if (extracted.length && !keys.has(CLASSES)) problems.push(`${name} node ${node} (${route}): extracted properties listed, but the node has no ${CLASSES}`)
    if (whole) for (const marker of [CLASSES, VARIABLES]) if (keys.has(marker)) problems.push(`${name} node ${node} (${route}): the whole node should stay on the runtime path, but it has ${marker}`)
  }
  return problems
}
