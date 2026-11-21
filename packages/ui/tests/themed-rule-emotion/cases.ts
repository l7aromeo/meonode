// What `ThemedRule` writes for a server component's themed css, beside what
// Emotion's own cache writes for the same css and class. The two must be the same
// text, since the rule cascades as the one Emotion would have written.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import createCache from '@emotion/cache'
import { serializeStyles } from '@emotion/serialize'
import { ThemedRule } from '@src/components/styled-renderer.client.js'

/** The class a server component gave the element. */
export const CLASS_NAME = 'meonode-css-x'

/**
 * Css covering what the two pipelines could compile apart: the stylis release
 * Emotion pins and a later one parse an empty custom property apart; Emotion's
 * own plugins drop labels and keep a pseudo selector in a list on its parent;
 * and its prefixer adds vendor rules.
 */
export const CASES: Record<string, Record<string, unknown>> = {
  'an empty custom property': { '--empty': '', color: 'red' },
  'a custom property holding a space': { '--space': ' ', color: 'red' },
  'a label': { label: 'card', color: 'red' },
  'a pseudo selector after a comma': { '&:hover, :focus': { color: 'red' } },
  'a pseudo selector list one level down': { '& .a': { ':hover, :focus-visible': { color: 'red' } } },
  'nested ampersands': { '& .a': { '&:hover': { color: 'red' }, '.dark &': { color: 'blue' } } },
  'an ampersand inside a pseudo class': { '&:not(:has(&))': { color: 'red' }, '&:is(.a, .b)': { color: 'blue' } },
  'a media query with a nested rule': { '@media (min-width: 1px)': { color: 'red', '&:hover': { color: 'blue' } } },
  'a named container query': { '@container card (min-width: 1px)': { color: 'red' } },
  'a supports query': { '@supports (display: grid)': { display: 'grid' } },
  'a layer': { '@layer base': { color: 'red' } },
  keyframes: { animation: 'spin 1s', '@keyframes spin': { from: { opacity: 0 }, to: { opacity: 1 } } },
  'prefixed declarations': { display: 'flex', userSelect: 'none', '&::placeholder': { color: 'gray' } },
}

/**
 * The rules Emotion's own cache writes for `css` on `className`, through its
 * default plugins: nothing is stored or inserted anywhere.
 * @returns The rule text.
 */
export function emotionRule(className: string, css: Record<string, unknown>): string {
  const cache = createCache({ key: 'reference' })
  const serialized = serializeStyles([css as never])
  const written: string[] = []
  // In the browser the rules go to the sheet; on the server they are returned.
  const rules = cache.insert(`.${className}`, serialized, { insert: (rule: string) => void written.push(rule) } as never, false)
  return typeof rules === 'string' ? rules : written.join('')
}

/**
 * The text of the rule `ThemedRule` renders for `css` on `className`.
 * @returns The rule text, or `''` when it renders none.
 */
export function themedRuleText(className: string, css: Record<string, unknown>): string {
  const html = renderToString(createElement(ThemedRule, { className, css: css as never }))
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('')
}
