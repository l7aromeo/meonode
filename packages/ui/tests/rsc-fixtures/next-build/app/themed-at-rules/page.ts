import { themedTree } from './tree'
import { cachedShape } from './cached'

/** Theme tokens in at-rule conditions and selectors, statically prerendered. */
export default function Page() {
  return themedTree([cachedShape()])
}
