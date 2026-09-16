import { Div } from '@meonode/ui'

/**
 * Nothing on this page reads the theme.
 *
 * That is the point: the mode is applied by the pre-paint script in the root
 * layout's `<head>`, so the markup the server produces is the same for every
 * reader. A page that rendered anything mode-dependent would put the per-reader
 * variation back into the document and make the byte comparison meaningless.
 */
export default function ThemeScriptPage() {
  return Div({ 'data-testid': 'theme-script-page', children: 'pre-paint theme script fixture' }).render()
}
