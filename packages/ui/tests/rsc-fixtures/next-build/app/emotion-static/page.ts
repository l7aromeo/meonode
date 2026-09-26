import { Div } from '@meonode/ui'

/**
 * #35's union check needs a prerendered page with several rules that reach the
 * flush only through the registry's emotion cache — intrinsic nodes, no
 * server-compiled classes — so the comparison between builds measures the
 * dedupe and nothing else.
 */
export default function Page() {
  return Div({
    children: [
      Div({ key: 1, color: '#1b4332', padding: 4, children: 'one' }),
      Div({ key: 2, color: '#2d6a4f', margin: 2, children: 'two' }),
      Div({ key: 3, color: '#40916c', css: { '&:hover': { color: '#52b788' } }, children: 'three' }),
      Div({ key: 4, color: '#74c69d', borderRadius: 4, children: 'four' }),
    ],
  }).render()
}
