import { chunkPage } from '../_parts/pages'

/** A boundary with an on-demand chunk below `ThemeProvider`. */
export default function Page() {
  return chunkPage()
}
