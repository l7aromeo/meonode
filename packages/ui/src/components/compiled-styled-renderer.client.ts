'use client'
import StyledRenderer from '@src/components/styled-renderer.client.js'
import { installCompiledStyles } from '@src/util/compiled-style.util.js'

/**
 * The `StyledRenderer` a server component hands a client reference whose style
 * the compiler named: it renders as `StyledRenderer` does, in the same fiber,
 * after installing how a compiled style renders, which no module in the
 * browser may have installed, none of them having registered a style. Bundlers
 * load it only where a server component renders one, so an app without the
 * compiler never does.
 * @param props `StyledRenderer`'s props, with the compiled style in place of css.
 * @returns The element.
 */
export default function CompiledStyledRenderer(props: Parameters<typeof StyledRenderer>[0]): ReturnType<typeof StyledRenderer> {
  installCompiledStyles()
  return StyledRenderer(props)
}
