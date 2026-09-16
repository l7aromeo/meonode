import { Div } from '@meonode/ui'
import { cookies } from 'next/headers'

/**
 * The negative control for the byte comparison in the RSC suite.
 *
 * This page reads a per-reader value on the server and renders it, so its
 * markup legitimately differs between two readers. If the comparison that
 * asserts `/theme-script` is identical for everybody could not tell these two
 * apart, it would not be measuring anything — an identical result would only
 * mean the comparison never ran.
 */
export default async function ThemeScriptVaryingPage() {
  const stored = (await cookies()).get('theme')?.value ?? 'none'
  return Div({ 'data-testid': 'theme-script-varying', children: `stored: ${stored}` }).render()
}
