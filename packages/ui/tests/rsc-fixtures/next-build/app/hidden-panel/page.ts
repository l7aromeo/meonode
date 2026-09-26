import { Closed } from '../_shared/slots'
import { panelThenVisible } from '../_shared/panels'

/** A visible element whose rule it shares with a panel the client never renders. */
export default function Page() {
  return panelThenVisible(Closed)
}
