/**
 * Pins a race in its losing order.
 *
 * Server-compiled rules reach the flush only if they are compiled before the
 * registry drains a process-global bucket, once. Which happens first moves with
 * worker scheduling — adding two unrelated pages to this fixture flipped
 * `/wrapped` from losing its rules to keeping them — so a test that relies on
 * the natural order passes or fails on the fixture's page count. Compiling
 * after a macrotask puts the rules after the only moment that could collect
 * them. A design without that moment passes either way.
 */
export const later = () => new Promise(resolve => setTimeout(resolve, 20))
