import type { EmotionCache } from '@emotion/cache'
import { isValidElement, use } from 'react'
import {
  isDevMode,
  STATIC_CARRIER_MARKER,
  STATIC_NAME_MARKER,
  STATIC_RUN_AFTER_PROP,
  STATIC_RUN_PROP,
  STATIC_SCOPE_PROP,
  STATIC_TEXT_PROP,
} from '@src/constant/common.const.js'
import { isValidElementType, REACT_ACTIVITY_TYPE, REACT_LAZY_TYPE, REACT_SUSPENSE_LIST_TYPE, REACT_SUSPENSE_TYPE } from '@src/helper/react-is.helper.js'
import type { NodeInstance } from '@src/types/node.type.js'
import { ThemeContext } from '@src/components/theme-provider.client.js'
import { installCompiledStyles } from '@src/util/compiled-style.util.js'
import CompiledStyledRenderer from '@src/components/compiled-styled-renderer.client.js'
import { checkCandidatesAfterCommit, checkThemeRefsInScope, type StaticThemeCandidate } from '@src/components/static-styles.js'
import { mayChangeTheme, passesChildrenThrough, providesTheme } from '@src/util/children-pass-through.util.js'
import { readEmotionCache } from '@src/util/emotion-cache.util.js'
import { namedClass, type NamedStyle, serverStyleElement, standInServerCache } from '@src/util/named-style.util.js'
import { type NamedRuntime, namedRuntime, type NamedWalk } from '@src/util/named-runtime-slot.util.js'
import { NodeUtil } from '@src/util/node.util.js'
import { createServerCssCache } from '@src/util/server-css-cache.util.js'
import { hasNamedStyles, staticStylesOf, templateText } from '@src/util/static-css.util.js'
import { nameText } from '@src/util/style-name.util.js'
import { collectNamedThemeVarRefs, diagnosticsEnabled, getTokensVarIndex, type ThemeVarIndex, unionThemeVarIndexes } from '@src/util/theme-diagnostics.util.js'
import { themedTexts } from '@src/util/themed-text-slot.util.js'
import { withWalkContexts } from '@src/util/walk-contexts.util.js'

// What only compiled output reaches: the walk over its named nodes, the texts it
// registered, and the contexts a memoized subtree's walk reads. Installed into
// `namedRuntime` when compiled output registers a style (`static-css.util.ts`), so
// an app built without the compiler tree-shakes this module.

/** A node of the walk, as this module reads it. */
type WalkNode = NodeInstance & { dependencies?: unknown }

/**
 * Whether `target` may put its children's rules out of the walk's order: what a
 * run since the last rule may not cross. A component renders its children where
 * it chooses, after rules of its own; a Suspense boundary may render them later,
 * and an Activity renders hidden children later in the browser and not at all on
 * the server. MeoNode's own providers render their children as given, so they
 * are not.
 */
const cutsRuleOrder = (target: unknown): boolean =>
  (mayChangeTheme(target) && !passesChildrenThrough(target)) ||
  target === REACT_SUSPENSE_TYPE ||
  target === REACT_SUSPENSE_LIST_TYPE ||
  target === REACT_ACTIVITY_TYPE

/** What a node renders: its `as` target where that is valid, else its element. */
const renderTargetOf = (node: WalkNode): unknown => {
  const as = (node.props as { as?: unknown }).as
  return as != null && isValidElementType(as) ? as : node.element
}

/**
 * Whether each element seen may render a component, so an element given again,
 * such as one built once and passed on every render, is not walked again. An
 * element never changes once created, so the answer holds for its lifetime.
 */
const elementRendersComponent = /* @__PURE__ */ new WeakMap<object, boolean>()

/**
 * Whether a child the walk does not enter, an element or what it holds, may
 * render a component: a `Component(...)` call's element, a styled node's, a lazy
 * reference, or a host element over one.
 */
function mayRenderComponent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(mayRenderComponent)
  if (NodeUtil.isNodeInstance(value)) return cutsRuleOrder(renderTargetOf(value)) || mayRenderComponent(value.props.children)
  if (isValidElement(value)) {
    let holds = elementRendersComponent.get(value)
    if (holds === undefined) {
      holds = cutsRuleOrder(value.type) || mayRenderComponent((value.props as { children?: unknown }).children)
      elementRendersComponent.set(value, holds)
    }
    return holds
  }
  return typeof value === 'object' && value !== null && (value as { $$typeof?: unknown }).$$typeof === REACT_LAZY_TYPE
}

/**
 * Whether a node renders through `StyledRenderer`, as its complete phase decides
 * outside the server layer: css left on the runtime path, and Emotion not disabled.
 * @param props The node's props.
 */
function beginsStyledRenderer(props: Record<string, unknown>): boolean {
  const css = props.css as object | null | undefined
  return !props.disableEmotion && !!css && Object.keys(css).length > 0
}

/**
 * The whole styles the compiler serialized, inserted into Emotion's own sheet
 * when Emotion would insert them: each node's before the next rule of the
 * render in the order its nodes begin, parents first. A runtime node, or a
 * named node with no rule before it since the walk's start or a cut, which
 * renders as a carrier, inserts the run of them that began since the last such
 * rule ahead of its own, from its `RuleInsertion`, and the run after it, up to
 * the next cut or the end of the walk, after its own. A node the compiler marks
 * as a carrier that follows a rule keeps `StyledRenderer` as its type, so React
 * keeps it, but its rule joins the run as an unmarked node's does. A cut is any child that
 * may put its rules out of the walk's order: a component, a boundary or a
 * memoized node. So every run goes in with a rule, and nothing is added to what
 * `.render()` returns.
 */
class Walk implements NamedWalk {
  /** The cache the render's elements go under, made from what was read, at its first named node that needs one. */
  private cache: EmotionCache | undefined
  /** Whether the cache where the walk runs was read yet. */
  private hasRead = false
  /** Whether the walk runs outside a component's render, where no cache can be read. */
  private underNoRender = false

  /**
   * A server render with no cache provider above the walk: Emotion gives each
   * outermost styled element a cache of its own, which every styled element
   * below it shares, so each styled node's scope is that element.
   */
  private readonly scoped = NodeUtil.isServer && readEmotionCache() === null
  /** Each styled node's scope, when the walk is scoped. */
  private readonly scopes = this.scoped ? new Map<WalkNode, EmotionCache>() : undefined

  /**
   * Named nodes that render through `StyledRenderer` instead, handed their
   * style: with no cache to read, neither its key nor the classes it registered,
   * which a `className` may hold, are known until the element renders under it.
   */
  private readonly atRender = new Set<WalkNode>()

  /**
   * Marked carriers that follow a rule: their rule joins the run, as an unmarked
   * node's does, and they render through `StyledRenderer` only to keep its type.
   */
  private readonly classOnly = new Set<WalkNode>()
  /** Each named node's class, from its begin phase, for its complete phase. */
  private readonly classes = new Map<WalkNode, string>()
  /** The run each runtime node inserts ahead of its own rule. */
  private readonly runs = new Map<WalkNode, NamedStyle[]>()

  /**
   * What each runtime node, or carrier, inserts after its own rule: the run that
   * began after it up to the next cut or the end of the walk, when no other
   * rule came between. Its element holds this object, filled in later.
   */
  private readonly runsAfter = new Map<WalkNode, { run: NamedStyle[] }>()

  /**
   * The last runtime node or carrier the walk began, since its start or the
   * last cut. A named node that begins with none is a carrier, so a run is
   * pending only while this is set.
   */
  private lastRuleNode: WalkNode | null = null
  /** The run since the last rule. */
  private pending: NamedStyle[] = []

  // In development, the theme tokens of named styles are checked where the
  // providers are, as `StyledRenderer` checks a styled element's. Production
  // builds none of this.
  readonly checks = diagnosticsEnabled()
  /** Named nodes' theme variables to check once committed, in a development build in the browser. */
  private candidates: StaticThemeCandidate[] | undefined
  private readonly checksAfterCommit = this.checks && isDevMode() && !NodeUtil.isServer

  /** What the walk reads where it runs, once: a provider's cache, Emotion's default (`null` on a server), or `undefined` outside a render. */
  private readCache(): EmotionCache | null | undefined {
    const read = this.hasRead ? this.cache : readEmotionCache()
    if (!this.hasRead) {
      this.hasRead = true
      this.underNoRender = read === undefined
      if (read) this.cache = read
    }
    return read
  }

  /**
   * The cache read, or a server's own where none is given. Only a walk inside a
   * render asks for it: in the browser, a cache keyed `css` moves every server
   * `<style>` still in the body into the head as it is made, and React's
   * development build runs components outside any render to read their frames.
   */
  private cacheOfWalk(): EmotionCache {
    return (this.cache ??= this.readCache() ?? createServerCssCache())
  }

  /** Whether the walk has no cache to read, being outside a component's render. */
  private hasNoCache(): boolean {
    this.readCache()
    return this.underNoRender
  }

  /** Hands the run since the last rule to `lastRuleNode`, to insert after its own. */
  private runAfterLastRule(): void {
    if (this.pending.length === 0) return
    this.runsAfter.get(this.lastRuleNode!)!.run.push(...this.pending)
    this.pending = []
  }

  /** Marks `node` as one whose `StyledRenderer` inserts a rule, so a later run can follow it. */
  private beginRuleNode(node: WalkNode): void {
    if (!this.runsAfter.has(node)) this.runsAfter.set(node, { run: [] })
    this.lastRuleNode = node
  }

  /** `node` takes the run since the last rule, to insert ahead of its own. */
  private takeRun(node: WalkNode): void {
    if (this.pending.length > 0) {
      this.runs.set(node, this.pending)
      this.pending = []
    }
    this.beginRuleNode(node)
  }

  cut(): void {
    this.runAfterLastRule()
    this.lastRuleNode = null
  }

  cutsAt(child: unknown): boolean {
    return NodeUtil.isNodeInstance(child)
      ? cutsRuleOrder(renderTargetOf(child)) || (child as WalkNode).dependencies !== undefined
      : typeof child === 'object' && child !== null && mayRenderComponent(child)
  }

  begin(walkNode: object, props: Record<string, unknown>, target: unknown, scope: EmotionCache | null): EmotionCache | null {
    const node = walkNode as WalkNode
    const name = props.disableEmotion ? undefined : (props[STATIC_NAME_MARKER] as string | undefined)
    const styles = name === undefined ? undefined : ((props[STATIC_TEXT_PROP] as string | undefined) ?? staticStylesOf(name))
    let childScope = scope
    if (this.scoped && (styles !== undefined || beginsStyledRenderer(props))) {
      childScope ??= createServerCssCache()
      this.scopes!.set(node, childScope)
    }
    if (name !== undefined && styles === undefined && isDevMode()) {
      console.error(`[MeoNode] The static style \`${name}\` is used but no module registered it, so no rule is sent for it.`)
    }
    // A carrier where no rule is before it since the walk's start or a cut, so
    // every run has a rule to go in with; anywhere with no cache to read; and for
    // a style whose conditions or selectors hold theme tokens, which only the
    // theme where its element renders resolves, as its css would.
    if (styles !== undefined && (this.hasNoCache() || this.lastRuleNode === null || themedTexts.resolver?.has(styles) === true)) {
      // A runtime node now: it takes the run since the last rule, as one does,
      // and the one after it that no later rule takes.
      this.atRender.add(node)
      this.takeRun(node)
    } else if (styles !== undefined) {
      // Following a rule: the run goes in after it.
      const { className, style } = namedClass(this.cacheOfWalk(), name!, styles, props.className, typeof target === 'string')
      this.classes.set(node, className)
      if (this.scoped) style.scope = childScope!
      this.pending.push(style)
      // Where the compiler marks a carrier, a render may need it to carry: it
      // keeps `StyledRenderer` as its type in this one too, so React keeps it.
      if (props[STATIC_CARRIER_MARKER]) this.classOnly.add(node)
    } else if (beginsStyledRenderer(props)) {
      this.takeRun(node)
    }
    return childScope
  }

  complete(walkNode: object, target: unknown): void {
    // A component may insert rules of its own after its children's, and a
    // boundary or a memoized node may render them apart: the run since the last
    // rule goes in after that rule, and what follows is no longer next to it.
    if (cutsRuleOrder(target) || (walkNode as WalkNode).dependencies !== undefined) this.cut()
  }

  scopeBelow(target: unknown, props: Record<string, unknown>, own: ThemeVarIndex | undefined): ThemeVarIndex | undefined | null {
    // MeoNode's own providers render their children as given, and a
    // ThemeProvider's tokens are known here, so the child's tokens resolve
    // against those merged over the ones above; any other component hides
    // what is above from the walk.
    if (providesTheme(target)) return unionThemeVarIndexes(own ?? null, getTokensVarIndex(props.tokens))
    return passesChildrenThrough(target) ? own : null
  }

  classOf(walkNode: object, text: string | undefined, opaqueAbove: boolean, themeOwn: ThemeVarIndex | undefined): string | undefined {
    const className = this.classes.get(walkNode as WalkNode)
    // A named node's theme variables, checked with nothing added to the render:
    // in the walk's own theme scope, here, against the providers above its
    // component and those the walk passed; under a component the walk cannot
    // see into, or outside any component's render, on the element once it is
    // committed, in the browser.
    if (className !== undefined && this.checks) {
      const refs = collectNamedThemeVarRefs(text ?? '')
      if (refs.length > 0 && (opaqueAbove || !checkThemeRefsInScope(refs, themeOwn)) && this.checksAfterCommit)
        (this.candidates ??= []).push({ classes: className, refs })
    }
    return className
  }

  rendersAtRender(node: object): boolean {
    return this.atRender.has(node as WalkNode)
  }

  rendersClassOnly(node: object): boolean {
    return this.classOnly.has(node as WalkNode)
  }

  runProps(walkNode: object): Record<string, unknown> | undefined {
    const node = walkNode as WalkNode
    const run = this.runs.get(node)
    const after = this.runsAfter.get(node)
    const scope = this.scopes?.get(node)
    if (run === undefined && after === undefined && scope === undefined) return undefined
    return {
      ...(run && { [STATIC_RUN_PROP]: run }),
      ...(after && { [STATIC_RUN_AFTER_PROP]: after }),
      ...(scope && { [STATIC_SCOPE_PROP]: scope }),
    }
  }

  finish(): void {
    this.runAfterLastRule()
    if (this.candidates !== undefined) checkCandidatesAfterCommit(this.candidates)
  }
}

const RUNTIME: NamedRuntime = {
  walk: () => (hasNamedStyles() ? new Walk() : undefined),
  textOf: name => staticStylesOf(name),
  template: (id, values) => {
    const text = templateText(id, values)
    return text === undefined ? undefined : { name: nameText(text), text }
  },
  // React allows no hook inside `useMemo`, and a walk with named styles reads
  // the Emotion cache, and in development the theme, as it renders: the
  // component around a memoized subtree reads them, where hooks may be called,
  // and hands them to the walk.
  memoContexts: () => (hasNamedStyles() ? { cache: readEmotionCache() ?? null, theme: diagnosticsEnabled() ? use(ThemeContext) : null } : undefined),
  withContexts: (contexts, run) => withWalkContexts(contexts, run),
  standInServerCache: () => standInServerCache(),
  serverStyleElement: (cache, styles) => serverStyleElement(cache, styles),
  // Read when a server render hands it, since the component's module imports
  // this one and may not have defined it yet while this one is evaluated.
  get clientRenderer() {
    return CompiledStyledRenderer
  },
}

/** Gives {@link namedRuntime} this module's runtime: called wherever a compiled style is registered. */
export function installNamedRuntime(): void {
  namedRuntime.current ??= RUNTIME
  installCompiledStyles()
}
