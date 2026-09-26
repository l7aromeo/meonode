/**
 * Delays a compile past a macrotask.
 *
 * Rules collected at one fixed moment of a render miss anything compiled after
 * it, and whether a compile lands before that moment otherwise depends on worker
 * scheduling. A page that compiles after this resolves misses such a moment
 * every time. Rules that travel with the render that compiles them arrive either
 * way.
 */
export const later = () => new Promise(resolve => setTimeout(resolve, 20))
