// Fixture: quoted-data-attribute
//
// Non-identifier string keys (`'data-parallax'`, `'aria-label'`) bucket
// normally: dash-cased
// attributes are never in the CSS property set, so they land in `d`, emitted
// with their original quoted key.
import { Div } from '@meonode/ui'

export default function QuotedDataAttribute() {
  return Div({
    padding: '4px',
    'data-parallax': 'true',
    'aria-label': 'Scroll section',
    children: 'Parallax section',
  })
}
