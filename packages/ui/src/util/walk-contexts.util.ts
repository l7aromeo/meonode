import type { EmotionCache } from '@emotion/cache'
import type { ThemeContextState } from '@src/components/theme-provider.client.js'

/**
 * The contexts a walk reads while it renders: the Emotion cache its elements go
 * under, and the theme its named nodes' tokens are checked against.
 */
export interface WalkContexts {
  cache: EmotionCache | null
  theme: ThemeContextState | null
}

let provided: WalkContexts | undefined

/**
 * Runs `run` with `contexts` as the ones its walk reads, for a walk that runs
 * where React allows no hook, such as inside `useMemo`: the component around it
 * reads them where it may and hands them in.
 * @param contexts The contexts, read by the component that runs the walk.
 * @param run The walk.
 * @returns What `run` returns.
 */
export function withWalkContexts<T>(contexts: WalkContexts, run: () => T): T {
  const outer = provided
  provided = contexts
  try {
    return run()
  } finally {
    provided = outer
  }
}

/** The contexts handed to the walk that is running, if one was. */
export const providedWalkContexts = (): WalkContexts | undefined => provided
