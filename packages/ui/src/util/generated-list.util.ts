import { isValidElement } from 'react'
import { COMPILED_MARKER, LIST_MARKER } from '@src/constant/common.const.js'
import { NodeUtil } from '@src/util/node.util.js'

/**
 * Development report for an unkeyed list that was generated at runtime, for
 * apps built without `@meonode/compiler`.
 *
 * `render()` hands children to React as separate arguments, which React reads
 * as written out by hand, so React never asks a MeoNode list for keys. Only the
 * source can say whether `children` was written out or generated, and without
 * the compiler nobody reads the source. A call site can still be watched: an
 * array written in the source has the same length every time it is evaluated
 * (`[A(), cond && B()]` is always 2), so one call site handing over unkeyed
 * arrays of different lengths is producing them at runtime.
 *
 * Only the length is observed, before anything filters or collapses it, and
 * nothing here changes what reaches React: this is one console line.
 *
 * A call site is identified by the frames above `Node` when it runs. More
 * frames only ever split a call site into finer ones, which can hide a list
 * but never invent one, so the key keeps every frame up to
 * {@link CALL_SITE_FRAMES}. That covers the factory wrappers between `Node`
 * and the author's code (`createNode`, `@meonode/mui`) and the author's own
 * helper and its caller.
 *
 * Reading the stack costs microseconds, so most calls skip it. Calls are first
 * grouped by what can be read off the call itself: the element, the type of
 * its first unkeyed child, and how many props it was given. While every call
 * in a group hands over the same length, none of its call sites can have
 * changed length, and the stack is only read for the first call of the group.
 * Once a group has seen two lengths, every call in it is identified.
 */

/**
 * Frames kept per call site: the factory layers (`createNode`, `@meonode/mui`,
 * a user `createNode` wrapper), the line that wrote the children, and enough
 * callers above it that one helper called from two places with lists of fixed
 * but different lengths counts as two call sites.
 */
const CALL_SITE_FRAMES = 8

/**
 * Call sites remembered at once. A long-lived server keeps this module for its
 * whole life, and a reloaded module gets new frame locations, so the table is
 * dropped and started again when it fills.
 */
const MAX_CALL_SITES = 2000

/** Call site → the length first seen there. */
let lengths = new Map<string, number>()
/** Marks a group that has seen two lengths, in place of the length. */
const MIXED = -1
/** Element → first unkeyed child's type → prop count → the group's length, or {@link MIXED}. */
let groups = new Map<unknown, Map<unknown, number[]>>()
let groupCount = 0
/** Call sites already reported, so each warns once per process. */
const reported = new Set<string>()

/**
 * Nodes and elements already seen in a list at the call site that wrote it. A
 * wrapper that hands its `children` on to an inner element, as they are or
 * re-wrapped, passes the same members, and the inner call site would see
 * whatever lengths its callers wrote.
 */
let claimed = new WeakSet<object>()

/**
 * The name of the frame React's development build calls every component
 * through, on the client and on the server. The frames below it are React's
 * scheduler, which differ between renders of the same code (a first render,
 * an update, StrictMode's second pass), so a call site ends there.
 */
const COMPONENT_BOUNDARY = 'react_stack_bottom_frame'

/** The structured frames V8 offers through `Error.prepareStackTrace`. */
interface CallSiteFrame {
  getFunctionName(): string | null
  getFileName(): string | null | undefined
  getLineNumber(): number | null
  getColumnNumber(): number | null
}

interface StackHolder {
  stack?: unknown
}
type ErrorConstructorWithV8 = ErrorConstructor & {
  captureStackTrace?: (target: object, constructorOpt?: (...args: never[]) => unknown) => void
  prepareStackTrace?: (error: Error, frames: CallSiteFrame[]) => unknown
}

const V8Error = Error as ErrorConstructorWithV8

/**
 * The type of a child that would need a `key` in a list, a node or element
 * without one, or `undefined` for any other child.
 */
function unkeyedType(child: unknown): unknown {
  if (NodeUtil.isNodeInstance(child)) return (child.rawProps as { key?: unknown }).key == null ? child.element : undefined
  return isValidElement(child) && child.key == null ? child.type : undefined
}

/**
 * Whether this call has to be identified by its stack: the first call of its
 * group, or any call of a group that has seen two lengths.
 */
function needsCallSite(element: unknown, rowType: unknown, propCount: number, length: number): boolean {
  let byRowType = groups.get(element)
  if (!byRowType) {
    if (groupCount >= MAX_CALL_SITES) {
      groups = new Map()
      groupCount = 0
    }
    byRowType = new Map()
    groups.set(element, byRowType)
  }
  let byPropCount = byRowType.get(rowType)
  if (!byPropCount) {
    byPropCount = []
    byRowType.set(rowType, byPropCount)
  }
  const seen = byPropCount[propCount]
  if (seen === undefined) {
    byPropCount[propCount] = length
    groupCount++
    return true
  }
  if (seen === length) return false
  byPropCount[propCount] = MIXED
  return true
}

/** A formatted stack without the frames from {@link COMPONENT_BOUNDARY} down. */
function aboveComponentBoundary(stack: string): string {
  const end = stack.indexOf(COMPONENT_BOUNDARY)
  return end === -1 ? stack : stack.slice(0, stack.lastIndexOf('\n', end))
}

/**
 * Frames of this module that a whole stack holds above the call site, taken
 * on top of {@link CALL_SITE_FRAMES} when the factory frame cannot be cut at.
 */
const OWN_FRAMES = 3

/** Whether a captured stack holds no frames. */
function isEmptyStack(stack: unknown): boolean {
  return Array.isArray(stack) ? stack.length === 0 : !String(stack ?? '').trim()
}

/**
 * Identifies the code that called `Node`, as a string that is equal for every
 * evaluation of the same source position on the same path.
 * @param below The function whose frame and everything above it are left out.
 */
function callSiteKey(below: (...args: never[]) => unknown): string {
  const capture = V8Error.captureStackTrace
  if (typeof capture !== 'function') return aboveComponentBoundary(String(new Error().stack))

  const previousLimit = Error.stackTraceLimit
  const previousPrepare = V8Error.prepareStackTrace
  try {
    Error.stackTraceLimit = CALL_SITE_FRAMES
    // Structured frames skip formatting the stack, and any source map lookup a
    // host installed for it, which is most of the cost of reading `.stack`.
    V8Error.prepareStackTrace = (_error, frames) => frames
    const holder: StackHolder = {}
    capture(holder, below)
    let stack = holder.stack
    // Safari drops the frame of a function that returns a call (proper tail
    // calls). When that was the frame to cut at, nothing is left, and the whole
    // stack identifies the call instead, this module's own frames included.
    if (isEmptyStack(stack)) {
      Error.stackTraceLimit = CALL_SITE_FRAMES + OWN_FRAMES
      const whole: StackHolder = {}
      capture(whole)
      stack = whole.stack
    }
    if (!Array.isArray(stack)) return aboveComponentBoundary(String(stack))
    let key = ''
    for (const frame of stack as CallSiteFrame[]) {
      if (frame.getFunctionName() === COMPONENT_BOUNDARY) break
      key += `${frame.getFileName()}:${frame.getLineNumber()}:${frame.getColumnNumber()}\n`
    }
    return key
  } finally {
    V8Error.prepareStackTrace = previousPrepare
    Error.stackTraceLimit = previousLimit
  }
}

/** Whether a line of a formatted stack is a frame: V8's `at …`, or Firefox and Safari's `name@location`. */
function isFrame(line: string): boolean {
  return /^\s+at /.test(line) || line.includes('@')
}

/** The script a formatted frame belongs to, without its line and column. */
function frameScript(line: string): string {
  return line.replace(/:\d+:\d+\)?\s*$/, '').replace(/^.*[(@]|^\s*at /, '')
}

/**
 * An `Error` whose stack starts at the call site, printed beside the message so
 * the console shows it as the developer's own frames, source-mapped where the
 * console supports that.
 */
function callSiteError(below: (...args: never[]) => unknown): Error {
  const error = new Error('The unkeyed list above was passed as `children` here.')
  error.name = 'MeoNode call site'
  V8Error.captureStackTrace?.(error, below)
  // V8 starts a stack with the error's own line; Firefox and Safari do not.
  const lines = aboveComponentBoundary(String(error.stack)).split('\n')
  while (lines.length > 0 && !lines[0].trim()) lines.shift()
  const header = lines.length > 0 && !isFrame(lines[0]) ? lines.shift() : undefined
  let frames = lines.filter(line => line.trim())
  if (frames.length === 0) {
    // The frame to cut at is missing (see `callSiteKey`). The whole stack
    // starts with this module's own frames, the first being this function's.
    frames = aboveComponentBoundary(String(new Error().stack))
      .split('\n')
      .filter(line => line.trim() && isFrame(line))
    const own = frames.length > 0 ? frameScript(frames[0]) : undefined
    while (frames.length > 1 && frameScript(frames[0]) === own) frames.shift()
  }
  // A factory a package builds on `Node`, such as `@meonode/mui`'s, adds frames
  // of its own above the author's; the stack starts at the first frame outside
  // an installed package.
  while (frames.length > 1 && frames[0].includes('/node_modules/')) frames.shift()
  error.stack = (header === undefined ? frames : [header, ...frames]).join('\n')
  return error
}

/**
 * Marks a list as belonging to the call site that wrote it. A copy made by
 * whoever receives the list, as it is or with siblings added around it, still
 * holds its first node or element, so that one member is enough to recognise it.
 */
function claim(list: readonly unknown[]): void {
  for (const member of list) {
    if (NodeUtil.isNodeInstance(member) || isValidElement(member)) {
      claimed.add(member)
      return
    }
  }
}

/**
 * Watches one `Node` call for an unkeyed generated `children` list. Called in
 * development only, before the node is built.
 * @param element The element the node renders.
 * @param props The props as the call site wrote them.
 * @param caller The function the call site called, which is left out of the stack.
 */
export function observeChildren(element: unknown, props: Record<string, unknown>, caller: (...args: never[]) => unknown): void {
  // A component can take a list in any prop and hand it on as some inner
  // element's `children`, as it is or re-wrapped. The list's own call site is
  // this one, so its members are claimed here and the inner call site skips them.
  const component = typeof element !== 'string'
  let propCount = 0
  for (const name in props) {
    propCount++
    if (component && name !== 'children' && Array.isArray(props[name])) claim(props[name] as unknown[])
  }

  const children = props.children
  if (!Array.isArray(children)) return
  // The compiler read this call site's source and decided already; when it
  // calls the list generated, its marker is what reports it.
  if (COMPILED_MARKER in props || LIST_MARKER in props) return

  let rowType: unknown
  for (const child of children) {
    // A member that already belonged to another list makes this a copy of that
    // list, re-wrapped by whoever received it (`[...children, Footer()]`). Its
    // length is the caller's, and the caller's call site was the one to watch.
    // An element React validated came to a component as a positional child,
    // which is React's own record of a list written out by hand. A mark a node
    // set when it handed the element on elsewhere is not that record. A server
    // component's output keeps that record on the client: on the element, or,
    // for a part the payload sent in a row of its own, on the lazy reference
    // that stands for it, which is not an element.
    if (child !== null && typeof child === 'object') {
      if (claimed.has(child)) return
      if ((child as { _store?: { validated?: unknown } })._store?.validated && !NodeUtil.isMarkedByNode(child)) return
    }
    rowType ??= unkeyedType(child)
  }
  claim(children)
  if (rowType === undefined) return
  if (!needsCallSite(element, rowType, propCount, children.length)) return

  const key = callSiteKey(caller)
  const first = lengths.get(key)
  if (first === undefined) {
    if (lengths.size >= MAX_CALL_SITES) lengths = new Map()
    lengths.set(key, children.length)
    return
  }
  if (first === children.length || reported.has(key)) return
  if (reported.size >= MAX_CALL_SITES) reported.clear()
  reported.add(key)

  console.warn(
    `[MeoNode] A \`children\` list without keys came from one call site with ${first}, then ${children.length} items, so it is generated at runtime rather than written out. ` +
      'MeoNode hands children to React as separate arguments, so React does not report it; the rows are matched by position and keep the wrong state when the list changes. ' +
      'Give each item a `key`, build the list with `For`, or add @meonode/compiler. The call site:',
    callSiteError(caller),
  )
}

/** How many call sites are remembered and reported, for tests. */
export function __generatedListState(): { callSites: number; groups: number; reported: number } {
  return { callSites: lengths.size, groups: groupCount, reported: reported.size }
}

/** Forgets every call site and array seen, for tests. */
export function __resetGeneratedListReport(): void {
  lengths = new Map()
  reported.clear()
  claimed = new WeakSet()
  groups = new Map()
  groupCount = 0
}
