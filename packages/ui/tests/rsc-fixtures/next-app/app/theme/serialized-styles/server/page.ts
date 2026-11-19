import { serializeStyles } from '@emotion/serialize'
import { SerializedStylesTree } from '../../../_components/serialized-styles-tree'

export default function Page() {
  return SerializedStylesTree({ testId: 'serialized-styles', styled: serializeStyles([{ padding: 'theme.spacing.md' }]) }).render()
}
