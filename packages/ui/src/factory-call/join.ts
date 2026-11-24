/**
 * The join of a factory call compiled output makes through `__meoFactoryCall`:
 * the call site of a factory imported from another module, whose initial props
 * the compiler could not read. This module is what `@meonode/ui` exports that
 * name from. Only compiled output imports it, so an app built without the
 * compiler never loads it; a module importing the light entry,
 * `@meonode/ui/factory-call`, joins once this one has run in the app.
 */
import { serializeUnnamed } from '@src/util/serialize-styles.util.js'
import { buildNode, combineFactoryProps, FACTORY_JOIN, initialPropsFingerprint, mergeFactoryProps } from '@src/core.node.js'
import { COMPILED_MARKER, isDevMode, STATIC_CARRIER_MARKER, STATIC_NAME_MARKER } from '@src/constant/common.const.js'
import CSSPropertySet from '@src/constant/css-properties.const.js'
import { callFactory, type FactoryCallSite, type FactoryShape } from '@src/factory-call/index.js'
import { getElementTypeName } from '@src/helper/common.helper.js'
import type { DependencyList, NodeElementType } from '@src/types/node.type.js'
import { observeChildren } from '@src/util/generated-list.util.js'
import { registerNamedText, staticStylesOf } from '@src/util/static-css.util.js'
import { nameStyles } from '@src/util/style-name.util.js'
import { diagnosticsEnabled } from '@src/util/theme-diagnostics.util.js'
import { keyHasThemeToken, keysMayMeet } from '@src/util/theme-key.util.js'
import { ThemeUtil } from '@src/util/theme.util.js'

/**
 * A site's style joined with its factory's initial props: the name and text
 * `StyledRenderer` gives it, and, for the development check, the fingerprint of
 * the call's own style. `null` when the site keeps the runtime path.
 */
type JoinedStyle = { name: string; styles: string; own: string | undefined } | null

/**
 * Each site's joined style, with the factory it was joined for. A site calls one
 * binding, so it holds one; a factory module evaluated again (a hot update)
 * gives the binding a new factory, which replaces it.
 */
const joinedStyles = /* @__PURE__ */ new WeakMap<FactoryCallSite, { factory: object; style: JoinedStyle }>()

/** The sites already reported in development for a call whose own style is not the one its site was joined with. */
const reportedSites = /* @__PURE__ */ new WeakSet<FactoryCallSite>()

/** Whether `value` is an object literal's kind of object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** The style part of props: `css` and every CSS property key, in their order. */
function stylePartOf(props: Record<string, unknown>): Record<string, unknown> {
  const style: Record<string, unknown> = {}
  for (const key of Object.keys(props)) if (key === 'css' || CSSPropertySet.has(key)) style[key] = props[key]
  return style
}

/** Props without their style part. */
function withoutStylePart(props: Record<string, unknown>): Record<string, unknown> {
  const rest: Record<string, unknown> = {}
  for (const key of Object.keys(props)) if (key !== 'css' && !CSSPropertySet.has(key)) rest[key] = props[key]
  return rest
}

/** Whether a style value is one `processProps` writes before the others. */
const isPrimitiveStyle = (value: unknown): boolean => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/** Whether a plain-data style holds a `styles` key at any depth, which Emotion reserves. */
function holdsStylesKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  for (const key of Object.keys(value)) if (key === 'styles' || holdsStylesKey((value as Record<string, unknown>)[key])) return true
  return false
}

/**
 * Whether a style's text can keep the theme tokens of its keys for the theme
 * where it renders to resolve, block by block: every key holding one, at any
 * depth, is an at-rule's condition over a block, and none is one a theme could
 * make equal to another key of its object (see {@link keysMayMeet}), which
 * resolving the object would fold into one. No value holds a brace, which the
 * text's blocks are found by.
 */
function joinsWithThemedKeys(style: Record<string, unknown>): boolean {
  const keys = Object.keys(style)
  for (const key of keys) {
    const value = style[key]
    if (keyHasThemeToken(key)) {
      if (!key.startsWith('@') || !isPlainObject(value)) return false
      for (const other of keys) if (other !== key && keysMayMeet(key, other)) return false
    }
    if (typeof value === 'string' && (value.includes('{') || value.includes('}'))) return false
    if (isPlainObject(value) && !joinsWithThemedKeys(value)) return false
  }
  return true
}

/**
 * The whole style of merged props as a compiled name: the `css` `processProps`
 * assembles from them (primitive flat props, then the other flat props, then
 * `css` over them), through the steps the compiler serializes a named style
 * with. A theme token in an at-rule's condition stays in the text, as the
 * compiler leaves it, for the theme where the element renders to resolve (see
 * `textForTheme`). `null` keeps the site on the runtime path: the style holds a
 * value that is not plain data (a function, an array, `undefined`, a `css()`
 * result), a `styles` key, or a theme token in a selector; it has no key, so the
 * node renders no class, or serializes to nothing; or its name holds another
 * text.
 */
function joinStyle(merged: Record<string, unknown>, own: string | undefined): JoinedStyle {
  const primitives: Record<string, unknown> = {}
  const others: Record<string, unknown> = {}
  for (const key of Object.keys(merged)) {
    if (key === 'css' || !CSSPropertySet.has(key)) continue
    if (isPrimitiveStyle(merged[key])) primitives[key] = merged[key]
    else others[key] = merged[key]
  }
  const css = merged.css
  if (css !== undefined && !isPlainObject(css)) return null
  const whole = { ...primitives, ...others, ...css }
  // A node with no style keys renders no class, which a name would give it.
  if (Object.keys(whole).length === 0 || initialPropsFingerprint(whole) === undefined || holdsStylesKey(whole)) return null
  const resolved = ThemeUtil.resolveObjWithTheme(whole, undefined, { processFunctions: true, themeStringsMode: 'vars' })
  let themedKey = false
  const kept = ThemeUtil.dropThemedKeys(resolved, () => {
    themedKey = true
  })
  // With no theme, only keys holding tokens are dropped: the `styles` keys are refused above.
  if (themedKey && !joinsWithThemedKeys(resolved)) return null
  const { name, styles } = nameStyles(serializeUnnamed([ThemeUtil.resolveDefaultStyle(themedKey ? resolved : kept)] as never))
  if (styles === '' || !registerNamedText(name, styles)) return null
  return { name, styles, own }
}

/**
 * A call of a factory this core made, through `__meoFactoryCall`: a call site
 * the compiler could not merge, since the factory's initial props are in
 * another module. The call site's style can't vary between renders, so its
 * first call joins it with the factory's initial props, and every call renders
 * a named node under that style, its other props merged as the factory merges
 * them; props left out join as `{}`. Anything else is called as written: a
 * site whose `at` is not the argument the factory reads its props from, in a
 * call with arguments, props that are not an object
 * literal's, a `theme` or `disableEmotion` in the call's or the factory's props,
 * and a style {@link joinStyle} keeps on the runtime path. In development, a
 * call whose own style is not its site's first call's is reported once and
 * called as written.
 * @param brand The factory's shape.
 * @param factory The factory.
 * @param site The call site, hoisted by the compiler.
 * @param args The call's arguments, as written.
 * @param caller The function the call site called, left out of the stack a development report shows.
 * @returns What `factory(...args)` returns, with the style named.
 */
function joinFactoryCall(
  brand: FactoryShape,
  factory: (...args: never[]) => unknown,
  site: FactoryCallSite,
  args: unknown[],
  caller: (...args: never[]) => unknown,
): unknown {
  // With no arguments, the site's `at` names none, and the factory reads no
  // props from either. Props left out merge as `{}`, as the factory merges them.
  const given = args[site.at]
  const props = given === undefined ? {} : given
  if (
    (args.length > 0 && site.at !== brand.propsAt) ||
    !isPlainObject(props) ||
    'theme' in props ||
    'disableEmotion' in props ||
    (brand.initialProps !== undefined && ('theme' in brand.initialProps || 'disableEmotion' in brand.initialProps))
  ) {
    return factory(...(args as never[]))
  }
  let joined = joinedStyles.get(site)
  if (joined === undefined || joined.factory !== factory) {
    joined = { factory, style: joinStyle(mergeFactoryProps(brand.initialProps, props), initialPropsFingerprint(stylePartOf(props))) }
    joinedStyles.set(site, joined)
  }
  const style = joined.style
  if (style === null) return factory(...(args as never[]))
  if (isDevMode() && initialPropsFingerprint(stylePartOf(props)) !== style.own) {
    if (!reportedSites.has(site)) {
      reportedSites.add(site)
      console.error(
        `[MeoNode] A call of the '${getElementTypeName(brand.element as NodeElementType)}' factory compiled as static has a style other than its first call's, so it renders on the runtime path. The compiler marked a call whose style varies.`,
      )
    }
    return factory(...(args as never[]))
  }
  // Held again if the registry was cleared since the join.
  if (staticStylesOf(style.name) === undefined) registerNamedText(style.name, style.styles)
  const combined = combineFactoryProps(brand.initialProps, props)
  // The check the call uncompiled gets, on the props it would build with: the
  // marker set below would skip it, though the compiler left the call's list
  // undecided unless its props carry a marker of their own.
  if (diagnosticsEnabled()) observeChildren(brand.element, brand.propsAt === 1 ? { ...combined, children: args[0] } : combined, caller)
  const built = withoutStylePart(combined)
  built[COMPILED_MARKER] = 2
  built[STATIC_NAME_MARKER] = style.name
  if (site.r === 1) built[STATIC_CARRIER_MARKER] = 1
  if (brand.propsAt === 1) built.children = args[0]
  return buildNode(brand.element as NodeElementType, built, args[brand.propsAt + 1] as DependencyList | undefined, factory)
}

/**
 * Calls an imported factory for a call site the compiler could not merge with
 * the factory's initial props, which are in another module:
 * `__meoFactoryCall(Panel, site, ...args)` stands for `Panel(...args)`. A
 * factory core made joins the call's style with its initial props (see
 * {@link joinFactoryCall}); anything else is called as written. Its first call
 * also gives this copy of core's slot its join, for calls through the light
 * entry; it is installed by a call rather than as the module loads, so a module
 * that is never called leaves nothing behind.
 * @param callee The binding the call site calls.
 * @param site The call site, hoisted by the compiler.
 * @param args The call's arguments, as written.
 * @returns What `callee(...args)` returns.
 */
export function __meoFactoryCall(callee: unknown, site: FactoryCallSite, ...args: unknown[]): unknown {
  FACTORY_JOIN.join ??= joinFactoryCall as NonNullable<typeof FACTORY_JOIN.join>
  return callFactory(callee, site, args, __meoFactoryCall as (...args: never[]) => unknown)
}
