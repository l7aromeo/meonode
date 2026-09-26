import { themedTree } from '../themed-at-rules/tree'

/** `/themed-at-rules`' tree with no `ThemeProvider` above it, so its tokens have no value. */
export default function Page() {
  return themedTree()
}
