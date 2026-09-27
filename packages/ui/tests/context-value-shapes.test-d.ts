// The values a theme or portal reader gets are public: their shapes do not move
// with how the providers hold their state.
import { expectTypeOf } from 'vitest'
import { type PortalContextValue, type ThemeContextValue, useTheme } from '@src/main.js'

expectTypeOf(useTheme).returns.toEqualTypeOf<ThemeContextValue>()
expectTypeOf<keyof ThemeContextValue>().toEqualTypeOf<'theme' | 'mode' | 'preference' | 'setMode' | 'setPreference' | 'hydrated' | 'modes'>()
expectTypeOf<ThemeContextValue['theme']>().toHaveProperty('mode')
expectTypeOf<keyof PortalContextValue>().toEqualTypeOf<'stack' | 'showPortal' | 'hidePortal' | 'hidePortalById' | 'hideAll'>()
