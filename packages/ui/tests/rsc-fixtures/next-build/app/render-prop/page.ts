import { tree } from './tree'

/** Prerendered at build time. */
export default function Page() {
  return tree().render()
}
