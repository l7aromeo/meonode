/**
 * Compile-time verification that a MUI wrapper keeps MUI's own polymorphism, the
 * `component` prop, with the `css` shapes `@meonode/ui` accepts, and keeps the
 * Emotion-layer `as` forbidden.
 * Run: bunx tsc --noEmit (the lint script).
 */
import Button from '@src/lib/mui.core/Button.js'

// --- Accepted ---
export const plain = Button({ css: { padding: ['1px', 'theme.spacing.md'] } })
export const asLink = Button({ component: 'a', href: '/home', css: { padding: ['theme.spacing.md'] } })
export const single = Button({ component: 'a', href: '#', css: { padding: 'theme.spacing.md' } })

// --- Rejected ---
// @ts-expect-error a fallback list holds strings
export const numberItems = Button({ css: { padding: [1] } })
// @ts-expect-error the Emotion-layer `as` stays forbidden on a MUI wrapper
export const emotionAs = Button({ as: 'a', css: { padding: ['1px'] } })
export const wrongHref = Button({
  component: 'a',
  // @ts-expect-error the `component` target's own props are still checked
  href: 5,
  css: { padding: ['1px'] },
})
