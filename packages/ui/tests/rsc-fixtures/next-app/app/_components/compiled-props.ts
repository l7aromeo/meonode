/**
 * Compiled output written by hand in the contract's shape. The schema marker goes
 * last: the build suite counts the compiler's call sites by the text `__meo$:2,`,
 * which these must not add to.
 */
export const compiledProps = <T extends object>(props: T): T & { __meo$: 2 } => ({ ...props, __meo$: 2 })
