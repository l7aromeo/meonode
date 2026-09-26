import { themedTree } from './tree'
import { cachedShapes } from './cached'

/** Theme tokens in at-rule conditions and selectors, statically prerendered. */
export default function Page() {
  return themedTree(cachedShapes())
}
