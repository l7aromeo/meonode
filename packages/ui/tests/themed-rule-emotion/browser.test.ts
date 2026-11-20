// @vitest-environment jsdom
//
// `ThemedRule` in the browser, where Emotion writes the rules it compiles to a sheet.
import { describe, expect, it } from 'vitest'
import { CASES, CLASS_NAME, emotionRule, themedRuleText } from '@tests/themed-rule-emotion/cases.js'

describe('the rule ThemedRule writes', () => {
  it.each(Object.entries(CASES))('is what Emotion writes for %s', (_, css) => {
    expect(themedRuleText(CLASS_NAME, css)).toBe(emotionRule(CLASS_NAME, css))
  })
})
