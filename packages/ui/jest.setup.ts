import '@testing-library/jest-dom/vitest'
import { TextEncoder, TextDecoder } from 'util'

// Polyfills for React Router
import 'whatwg-fetch'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder

// A test file's compiled module registers its static css as it loads, once, as
// an app's module does. Hooks here run after the file has loaded, so a reset
// between its tests returns to what it registered, not to nothing. The registry
// is imported there too, after the file's own mocks, so a test that replaces a
// module, as one replacing `react` does, has it replaced in every module the
// registry loads.
import { beforeAll } from 'vitest'

beforeAll(async () => (await import('@src/util/static-css.util.js')).__markStaticCssBaseline())
