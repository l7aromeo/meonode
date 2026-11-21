// @vitest-environment node
//
// `ThemedRule` in the server pass of the client tree, where Emotion returns the rules it compiles.
import { describe, expect, it } from 'vitest'
import { CASES, CLASS_NAME, emotionRule, themedRuleText } from '@tests/themed-rule-emotion/cases.js'

describe('the rule ThemedRule writes', () => {
  it.each(Object.entries(CASES))('is what Emotion writes for %s', (_, css) => {
    expect(themedRuleText(CLASS_NAME, css)).toBe(emotionRule(CLASS_NAME, css))
  })
})

describe('the rules ThemedRule writes for two classes with the same css', () => {
  it('each name their own class, though the server memoizes compiled rules', () => {
    const css = { '&:hover': { color: 'red' } }

    expect([themedRuleText('meonode-css-a', css), themedRuleText('meonode-css-b', css)]).toEqual([
      '.meonode-css-a:hover{color:red;}',
      '.meonode-css-b:hover{color:red;}',
    ])
  })
})
