// Factories the joined case imports: the compiler cannot see their defaults
// from the calling module, so it joins each call with them at run time.
import { createNode } from '@meonode/ui'

/** Literal defaults, a flat style prop and css. */
export const Chip = createNode('span', { padding: 2, css: { color: 'rgb(0, 90, 0)', borderBottom: '1px solid rgb(0, 90, 0)' } })

/** Defaults that turn Emotion off, which the join refuses at run time. */
export const Plain = createNode('span', { disableEmotion: true, padding: 4 })

/** Defaults that read theme tokens. */
export const Themed = createNode('span', { color: 'theme.text', padding: 'theme.space.sm' })
