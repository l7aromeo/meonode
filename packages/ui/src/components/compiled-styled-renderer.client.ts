'use client'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { installNamedRuntime } from '@src/util/named-runtime.util.js'

/**
 * The `StyledRenderer` a server component hands a client reference whose style
 * the compiler named: it renders as `StyledRenderer` does, in the same fiber,
 * after installing how a compiled style renders, which no module in the
 * browser may have installed, none of them having registered a style.
 *
 * Only the server's named runtime refers to it, so an app without the compiler
 * never loads it. A bundler that splits the browser's modules by route segment
 * places it with the outermost server component that registers a style; the
 * whole named runtime comes with it there, the registry included, so sibling
 * segments below that register styles, such as a layout and a `not-found`,
 * share it instead of each loading its own copy.
 * @param props `StyledRenderer`'s props, with the compiled style in place of css.
 * @returns The element.
 */
export default function CompiledStyledRenderer(props: Parameters<typeof StyledRenderer>[0]): ReturnType<typeof StyledRenderer> {
  installNamedRuntime()
  return StyledRenderer(props)
}
