import { Div } from '@meonode/ui'

/**
 * A page with something to look at.
 *
 * The flicker probe samples the painted background at the centre of the
 * viewport, so this fills it with a colour that comes from a theme token. The
 * token resolves to `var(--fixture-base)`, whose value is declared per mode in
 * `theme-fixture.css` under `[data-theme="…"]` — which is the whole mechanism:
 * the markup is identical for every reader and the attribute decides the colour
 * before the first frame.
 */
export default function ThemeFlickerPage() {
  return Div({
    'data-testid': 'theme-flicker-page',
    backgroundColor: 'theme.base.default',
    color: 'theme.base.content',
    minHeight: '100vh',
    width: '100%',
    children: 'flicker fixture',
  }).render()
}
