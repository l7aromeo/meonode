import { __checksSettled } from '@src/util/static-theme-check.util.js'

/**
 * How long the theme checks after commit get to finish before a wait for them
 * fails: past their longest run, about two seconds of looks for server markup
 * React has not hydrated, and inside vitest's 5 s test timeout, so a hang is
 * reported as one rather than as a timeout.
 */
export const CHECKS_SETTLE_TIMEOUT_MS = 4_000

/**
 * Resolves once every theme check scheduled after a commit has run and
 * reported: a wait on the checks themselves, not a time a loaded machine outlasts.
 * @throws When a check is still scheduled after {@link CHECKS_SETTLE_TIMEOUT_MS}.
 */
export async function checksSettled(): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      __checksSettled(),
      new Promise((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error(`theme checks after commit still scheduled after ${CHECKS_SETTLE_TIMEOUT_MS} ms`)),
          CHECKS_SETTLE_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    clearTimeout(deadline)
  }
}
