import { chunkPage } from '../../hydration/_parts/pages'

/** `/hydration/chunk` with no `ThemeProvider` above it: the control. */
export default function Page() {
  return chunkPage()
}
