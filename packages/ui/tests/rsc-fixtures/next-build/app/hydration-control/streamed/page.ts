import { streamedPage } from '../../hydration/_parts/pages'

/** `/hydration/streamed` with no `ThemeProvider` above it: the control. */
export default function Page() {
  return streamedPage()
}
