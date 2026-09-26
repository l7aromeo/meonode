import { Open } from '../_shared/slots'
import { panelThenVisible } from '../_shared/panels'

/** `/hidden-panel` with the panel rendered: the control. */
export default function Page() {
  return panelThenVisible(Open)
}
