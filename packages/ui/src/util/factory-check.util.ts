import { isValidElement } from 'react'
import { COMPILED_MARKER, COMPILER_SCHEMA_KEYS } from '@src/constant/common.const.js'
import CSSPropertySet from '@src/constant/css-properties.const.js'
import { getElementTypeName } from '@src/helper/common.helper.js'
import type { NodeElementType } from '@src/types/node.type.js'
import { NodeUtil } from '@src/util/node.util.js'

// The development checks of a factory call's arguments. Part of the
// diagnostics, which only `diagnostics.util.ts` loads.

/**
 * Distinct deps messages remembered at once. A long-lived development server
 * keeps this module for its whole life and sees a factory for every element and
 * component it renders, so the set is dropped and started again when it fills.
 */
const MAX_DEPS_REPORTS = 500

/** The deps messages already logged, so a call a component makes on every render is reported once. */
const reportedDeps = new Set<string>()

/** How many deps messages are remembered, and the cap, for tests. */
export function __depsReportState(): { reported: number; cap: number } {
  return { reported: reportedDeps.size, cap: MAX_DEPS_REPORTS }
}

/** Forgets every deps message logged, for tests. */
export function __resetDepsReport(): void {
  reportedDeps.clear()
}

/**
 * Which factory an author called, as {@link checkFactoryArguments} receives it:
 * `Node` itself, or a factory that takes `children` first or `props` first.
 */
export type FactoryShape = 'node' | 'children-first' | 'props-first'

/** The call an author wrote, named with its signature, for a message about one of its arguments. */
function describeFactoryCall(element: NodeElementType, factory: FactoryShape, component: string | undefined): string {
  if (factory === 'node') return component === undefined ? 'Node takes (element, props, deps)' : `Component(${component}) takes (props, deps)`
  const name = getElementTypeName(element)
  return factory === 'children-first' ? `The '${name}' factory takes (children, props, deps)` : `The '${name}' factory takes (props, deps)`
}

/**
 * Reports a `deps` argument that is not an array. React reads deps as a list,
 * so anything else is a mistake, most often a props object passed one place
 * too far, as `Li('x', { key })` on a factory that takes `(props, deps)`. The
 * call itself is left as it was; `null` and an omitted `deps` mean no
 * memoisation, as they always have. Each distinct message is logged once, since
 * a component makes the same call on every render.
 */
function checkDeps(element: NodeElementType, deps: unknown, factory: FactoryShape, component: string | undefined): void {
  if (deps == null || Array.isArray(deps)) return
  const given = typeof deps === 'object' ? 'an object' : `a ${typeof deps}`
  const message =
    `[MeoNode] deps must be an array, but was given ${given}. ${describeFactoryCall(element, factory, component)}; ` +
    'a props object one place too far lands in deps, where it is not applied as props.'
  if (reportedDeps.has(message)) return
  if (reportedDeps.size >= MAX_DEPS_REPORTS) reportedDeps.clear()
  reportedDeps.add(message)
  console.error(message)
}

/**
 * Distinct style-value messages remembered at once, dropped and started again
 * when full, as with {@link MAX_DEPS_REPORTS}.
 */
const MAX_STYLE_VALUE_REPORTS = 500

/** The style-value messages already logged, so a call a component makes on every render is reported once. */
const reportedStyleValues = new Set<string>()

/** How many style-value messages are remembered, and the cap, for tests. */
export function __styleValueReportState(): { reported: number; cap: number } {
  return { reported: reportedStyleValues.size, cap: MAX_STYLE_VALUE_REPORTS }
}

/** Forgets every style-value message logged, for tests. */
export function __resetStyleValueReport(): void {
  reportedStyleValues.clear()
}

/**
 * What a value under a style prop is when no style can be it, or `undefined`
 * when a style can: a string, number, function, array or plain object holds a
 * style, while a DOM node, a React element, a node, an instance of a class, or
 * an object that contains itself does not. Emotion would walk such a value's
 * links without end, so it is the first of them found, with its path below
 * `path`. `within` maps each object being walked above it to its path.
 */
function notAStyle(value: unknown, path: string, within: Map<object, string>): { path: string; kind: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const above = within.get(value)
  if (above !== undefined) return { path, kind: `a reference back to \`${above}\`, an object that contains itself` }
  const nodeType = (value as { nodeType?: unknown }).nodeType
  const nodeName = (value as { nodeName?: unknown }).nodeName
  if (typeof nodeType === 'number' && typeof nodeName === 'string') return { path, kind: `a DOM node (${nodeName})` }
  if (isValidElement(value)) return { path, kind: 'a React element' }
  if (NodeUtil.isNodeInstance(value)) return { path, kind: `a node (${getElementTypeName(value.element)})` }
  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return { path, kind: `an instance of ${(prototype?.constructor as { name?: string } | undefined)?.name || 'a class'}` }
  }
  within.set(value, path)
  try {
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue
      const found = notAStyle((value as Record<string, unknown>)[key], `${path}.${key}`, within)
      if (found) return found
    }
  } finally {
    within.delete(value)
  }
  return undefined
}

/**
 * Reports a value no style can be under a prop MeoNode takes as a style: one
 * named like a CSS property, or `css`. A component prop that shares a CSS
 * property's name, as a portal's `container`, never reaches the component, and
 * a DOM node or an object that contains itself there sends styling into
 * endless recursion with nothing that names the prop. Only the message is
 * added; the call behaves as before. Each distinct message is logged once,
 * since a component makes the same call on every render.
 */
function checkStyleValues(element: NodeElementType, props: Record<string, unknown>, component: string | undefined): void {
  // Compiled output carries the values only known at run time in its css
  // bucket, under the names they were written with.
  const bucketName = COMPILER_SCHEMA_KEYS[props[COMPILED_MARKER] as number]?.css
  const bucket = bucketName === undefined ? undefined : props[bucketName]
  if (typeof bucket === 'object' && bucket !== null) checkStyleEntries(element, bucket as Record<string, unknown>, true, component)
  checkStyleEntries(element, props, false, component)
}

/**
 * {@link checkStyleValues} for one object: each of its entries taken as a
 * style, or, unless `allStyles`, only `css` and those named like a CSS property.
 */
function checkStyleEntries(element: NodeElementType, props: Record<string, unknown>, allStyles: boolean, component: string | undefined): void {
  for (const key in props) {
    if (!allStyles && key !== 'css' && !CSSPropertySet.has(key)) continue
    const value = props[key]
    if (typeof value !== 'object' || value === null) continue
    const found = notAStyle(value, key, new Map())
    if (!found) continue
    const node = component === undefined ? `'${getElementTypeName(element)}'` : `Component(${component})`
    const message =
      `[MeoNode] The \`${found.path}\` style on ${node} holds ${found.kind}, which no style can be. ` +
      (key === 'css'
        ? 'MeoNode takes everything in the css prop as a style. To pass a value to the element as a prop, put it in `props: { … }`.'
        : `\`${key}\` is a CSS property, so MeoNode takes it as a style and never passes it on as a prop. To pass it as a prop, put it in \`props: { ${key}: … }\`.`)
    if (reportedStyleValues.has(message)) continue
    if (reportedStyleValues.size >= MAX_STYLE_VALUE_REPORTS) reportedStyleValues.clear()
    reportedStyleValues.add(message)
    console.error(message)
  }
}

/**
 * Checks a factory call's `deps` and the values under its style props, in
 * development: the author's call, before the node is built.
 * @param element The element the node renders.
 * @param props The props as the call site wrote them.
 * @param deps The `deps` argument.
 * @param factory Which factory the author called.
 * @param component The component a `Component` callable renders, when `element` is its renderer.
 */
export function checkFactoryArguments(
  element: NodeElementType,
  props: Record<string, unknown>,
  deps: unknown,
  factory: FactoryShape,
  component: string | undefined,
): void {
  checkDeps(element, deps, factory, component)
  checkStyleValues(element, props, component)
}
