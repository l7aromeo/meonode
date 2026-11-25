// Waits on React's own work in a test, instead of a fixed time a loaded
// machine outlasts.

/** The prefix of the key React marks a root's container with, holding the root's host fiber. */
export const REACT_CONTAINER_KEY = '__reactContainer$'

/**
 * How long React gets to finish its work before a wait for it fails: far past
 * any React work in these suites on a loaded machine, short enough to report a hang.
 */
export const REACT_IDLE_TIMEOUT_MS = 10_000

/**
 * The polls in a row that must find every root idle. React runs passive
 * effects as a scheduler task, posted with `setImmediate`, which no root field
 * records; between two `setTimeout(0)` polls the event loop passes its
 * immediates once, so such a task has run by the second poll, and anything it
 * schedules shows on the root.
 */
const REACT_IDLE_POLLS = 2

/** The fields of React's FiberRoot that say whether it has work left. */
export interface FiberRoot {
  pendingLanes: number
  callbackNode: unknown
}

/**
 * The FiberRoot of the root rendered into `container`.
 *
 * `pendingLanes` (the updates not yet committed, hidden Activity content
 * among them) and `callbackNode` (the scheduler task React has posted for
 * them) are React internals, read here because React exposes no way to ask
 * whether a root has finished. If a React release renames or removes them,
 * this throws at once rather than letting a wait pass early; the wait then
 * needs another condition.
 * @param container The element a root was created on.
 * @returns The root's FiberRoot.
 */
export function fiberRootOf(container: Element): FiberRoot {
  const key = Object.keys(container).find(name => name.startsWith(REACT_CONTAINER_KEY))
  const root = key && (container as unknown as Record<string, { stateNode?: Partial<FiberRoot> } | null>)[key]?.stateNode
  if (!root || typeof root.pendingLanes !== 'number' || !('callbackNode' in root)) {
    throw new Error(`no React FiberRoot with pendingLanes and callbackNode on <${container.tagName.toLowerCase()} id="${container.id}">`)
  }
  return root as FiberRoot
}

/**
 * Resolves once React has nothing left to do for `roots`: no uncommitted
 * lanes and no task posted, on {@link REACT_IDLE_POLLS} polls in a row. Waits
 * on the work itself rather than a fixed time, which a loaded machine
 * outlasts. React's scheduler runs its tasks on `setImmediate` in Node,
 * jsdom included.
 * @param roots The FiberRoots, taken before an unmount, which unmarks the container.
 * @throws When React is still busy after {@link REACT_IDLE_TIMEOUT_MS}.
 */
export async function reactIdle(roots: FiberRoot[]) {
  const deadline = performance.now() + REACT_IDLE_TIMEOUT_MS
  for (let idle = 0; idle < REACT_IDLE_POLLS;) {
    await new Promise(resolve => setTimeout(resolve, 0))
    idle = roots.every(root => root.pendingLanes === 0 && root.callbackNode === null) ? idle + 1 : 0
    if (idle < REACT_IDLE_POLLS && performance.now() > deadline) {
      throw new Error(`React still had work after ${REACT_IDLE_TIMEOUT_MS} ms: pendingLanes ${roots.map(root => root.pendingLanes).join(', ')}`)
    }
  }
}
