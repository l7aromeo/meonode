import type { EmotionCache } from '@emotion/cache'

/**
 * The Emotion cache the elements of a render go under, in the server build: none.
 * The React Server Components layer has no Emotion, and its React no context, so
 * this module loads neither; the default build swaps in
 * `emotion-cache.default.util.ts`, which reads it.
 * @returns `null`.
 */
export const readEmotionCache = (): EmotionCache | null | undefined => null
