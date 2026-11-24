/**
 * Components MeoNode ships that render the children they are given as they are,
 * inside a context provider: they never count, inspect or clone them.
 *
 * A server component may therefore put an element beside the child it hands one
 * of them, for a rule that must render inside that component's context, without
 * changing what the component does. Any other component may inspect its children
 * (`Children.only`, `cloneElement`), so it is handed exactly what it was given.
 *
 * Each module registers the component its node factory renders, the same object
 * a node of it holds as its element, so the check is an identity test that does
 * not depend on how a bundler represents a client component.
 */
const passThrough = new WeakSet<object>()

/**
 * Records that a component renders its children as given.
 * @param component The component a MeoNode factory renders.
 */
export function registerChildrenPassThrough(component: unknown): void {
  if ((typeof component === 'function' || typeof component === 'object') && component !== null) passThrough.add(component)
}

/**
 * Whether a component is one of MeoNode's own that render their children as given.
 * @param component An element type.
 * @returns `true` for a registered component.
 */
export function passesChildrenThrough(component: unknown): boolean {
  return (typeof component === 'function' || typeof component === 'object') && component !== null && passThrough.has(component)
}

/** Of those, the ones that provide a theme from their `tokens` prop. */
const themeProviders = new WeakSet<object>()

/**
 * Records that a component provides a theme from its `tokens`, as `ThemeProvider`
 * does, so a render that holds it can tell which tokens its children resolve
 * against without reading the context.
 * @param component The component a MeoNode factory renders.
 */
export function registerThemeProvider(component: unknown): void {
  if ((typeof component === 'function' || typeof component === 'object') && component !== null) themeProviders.add(component)
}

/**
 * Whether a component provides a theme from its `tokens` prop.
 * @param component An element type.
 * @returns `true` for a registered component.
 */
export function providesTheme(component: unknown): boolean {
  return (typeof component === 'function' || typeof component === 'object') && component !== null && themeProviders.has(component)
}

/**
 * Whether the theme can differ inside this element from outside it.
 *
 * A component can render a provider around its children, a nested
 * `ThemeProvider` being the case that matters, so its children may read another
 * theme than its parent does. A host element and the built-in symbols (fragments,
 * Suspense, StrictMode) supply no context.
 */
export function mayChangeTheme(renderTarget: unknown): boolean {
  return typeof renderTarget === 'function' || (typeof renderTarget === 'object' && renderTarget !== null)
}
