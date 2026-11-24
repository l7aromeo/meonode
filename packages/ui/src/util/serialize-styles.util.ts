import unitless from '@emotion/unitless'
import type { SerializedStyles } from '@emotion/serialize'
import { isDevMode } from '@src/constant/common.const.js'

/*!
 * @license
 * Copied from Emotion: `packages/serialize/src/index.ts` in emotion-js/emotion,
 * as published in `@emotion/serialize` 1.3.3.
 *
 * MIT License
 *
 * Copyright (c) Emotion team and other contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Emotion's `serializeStyles`, copied so the styles MeoNode names skip the hash
 * Emotion computes for its own class name, which MeoNode replaces with
 * `nameStyles`'s. The text, the label suffix and the keyframes list are
 * Emotion's, character for character, in both its production and development
 * builds, and so are the development errors it logs and throws.
 * `tests/style-names/serialize.test.ts` fails if the installed package ever
 * writes something this copy does not.
 *
 * The one difference: the returned `name` holds only the label suffix (`''`, or
 * `-label…`), where Emotion's begins with its hash. `nameStyles` reads only
 * that suffix. A lone argument that is already serialized is returned as it is,
 * as Emotion returns it, so callers must not change the result in place.
 */

const hyphenateRegex = /[A-Z]|^ms/g
const animationRegex = /_EMO_([^_]+?)_([^]*?)_EMO_/g
const labelPattern = /label:\s*([^\s;{]+)\s*(;|$)/g

const ILLEGAL_ESCAPE_SEQUENCE_ERROR =
  "You have illegal escape sequence in your template literal, most likely inside content's property value.\nBecause you write your CSS inside a JavaScript string you actually have to do double escaping, so for example \"content: '\\00d7';\" should become \"content: '\\\\00d7';\".\nYou can read more about this here:\nhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#ES2018_revision_of_illegal_escape_sequences"
const UNDEFINED_AS_OBJECT_KEY_ERROR =
  "You have passed in falsy value as style object's key (can happen when in example you pass unexported component as computed key)."
const noComponentSelectorMessage =
  'Component selectors can only be used in conjunction with @emotion/babel-plugin, the swc Emotion plugin, or another Emotion-aware compiler transform.'

type Registered = Record<string, string | undefined> | undefined | null
interface Keyframe {
  name: string
  styles: string
  next: Keyframe | undefined
}

/** The keyframes found while serializing, as Emotion's module-level cursor. */
let cursor: Keyframe | undefined

const isCustomProperty = (property: string): boolean => property.charCodeAt(1) === 45
const isProcessableValue = (value: unknown): boolean => value != null && typeof value !== 'boolean'

const styleNames: Record<string, string> = Object.create(null)
function processStyleName(styleName: string): string {
  let name = styleNames[styleName]
  if (name === undefined) name = styleNames[styleName] = isCustomProperty(styleName) ? styleName : styleName.replace(hyphenateRegex, '-$&').toLowerCase()
  return name
}

function processStyleValueProduction(key: string, value: any): any {
  switch (key) {
    case 'animation':
    case 'animationName': {
      if (typeof value === 'string') {
        return value.replace(animationRegex, (_match: string, p1: string, p2: string) => {
          cursor = { name: p1, styles: p2, next: cursor }
          return p1
        })
      }
    }
  }
  if ((unitless as Record<string, number>)[key] !== 1 && !isCustomProperty(key) && typeof value === 'number' && value !== 0) return value + 'px'
  return value
}

const contentValuePattern = /(var|attr|counters?|url|element|(((repeating-)?(linear|radial))|conic)-gradient)\(|(no-)?(open|close)-quote/
const contentValues = ['normal', 'none', 'initial', 'inherit', 'unset']
const msPattern = /^-ms-/
const hyphenPattern = /-(.)/g
const hyphenatedCache: Record<string, true> = {}

function processStyleValue(key: string, value: any): any {
  if (!isDevMode()) return processStyleValueProduction(key, value)
  if (key === 'content') {
    if (
      typeof value !== 'string' ||
      (contentValues.indexOf(value) === -1 &&
        !contentValuePattern.test(value) &&
        (value.charAt(0) !== value.charAt(value.length - 1) || (value.charAt(0) !== '"' && value.charAt(0) !== "'")))
    ) {
      throw new Error("You seem to be using a value for 'content' without quotes, try replacing it with `content: '\"" + value + '"\'`')
    }
  }
  const processed = processStyleValueProduction(key, value)
  if (processed !== '' && !isCustomProperty(key) && key.indexOf('-') !== -1 && hyphenatedCache[key] === undefined) {
    hyphenatedCache[key] = true
    console.error(
      'Using kebab-case for css properties in objects is not supported. Did you mean ' +
        key.replace(msPattern, 'ms-').replace(hyphenPattern, (_str: string, char: string) => char.toUpperCase()) +
        '?',
    )
  }
  return processed
}

function handleInterpolation(mergedProps: unknown, registered: Registered, interpolation: any): any {
  if (interpolation == null) return ''
  const componentSelector = interpolation
  if (componentSelector.__emotion_styles !== undefined) {
    if (isDevMode() && String(componentSelector) === 'NO_COMPONENT_SELECTOR') throw new Error(noComponentSelectorMessage)
    return componentSelector
  }
  switch (typeof interpolation) {
    case 'boolean':
      return ''
    case 'object': {
      const keyframes = interpolation
      if (keyframes.anim === 1) {
        cursor = { name: keyframes.name, styles: keyframes.styles, next: cursor }
        return keyframes.name
      }
      const serializedStyles = interpolation
      if (serializedStyles.styles !== undefined) {
        let next = serializedStyles.next
        if (next !== undefined) {
          while (next !== undefined) {
            cursor = { name: next.name, styles: next.styles, next: cursor }
            next = next.next
          }
        }
        return serializedStyles.styles + ';'
      }
      return createStringFromObject(mergedProps, registered, interpolation)
    }
    case 'function': {
      if (mergedProps !== undefined) {
        const previousCursor = cursor
        const result = interpolation(mergedProps)
        cursor = previousCursor
        return handleInterpolation(mergedProps, registered, result)
      } else if (isDevMode()) {
        console.error(
          'Functions that are interpolated in css calls will be stringified.\n' +
            'If you want to have a css call based on props, create a function that returns a css call like this\n' +
            'let dynamicStyle = (props) => css`color: ${props.color}`\n' +
            'It can be called directly with props or interpolated in a styled call like this\n' +
            "let SomeComponent = styled('div')`${dynamicStyle}`",
        )
      }
      break
    }
    case 'string':
      if (isDevMode()) {
        const matched: string[] = []
        const replaced = interpolation.replace(animationRegex, (_match: string, _p1: string, p2: string) => {
          const fakeVarName = 'animation' + matched.length
          matched.push('const ' + fakeVarName + ' = keyframes`' + p2.replace(/^@keyframes animation-\w+/, '') + '`')
          return '${' + fakeVarName + '}'
        })
        if (matched.length) {
          console.error(
            '`keyframes` output got interpolated into plain string, please wrap it with `css`.\n\nInstead of doing this:\n\n' +
              [...matched, '`' + replaced + '`'].join('\n') +
              '\n\nYou should wrap it with `css` like this:\n\ncss`' +
              replaced +
              '`',
          )
        }
      }
      break
  }
  const asString = interpolation
  if (registered == null) return asString
  const cached = registered[asString]
  return cached !== undefined ? cached : asString
}

function createStringFromObject(mergedProps: unknown, registered: Registered, obj: any): string {
  let string = ''
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) string += handleInterpolation(mergedProps, registered, obj[i]) + ';'
  } else {
    for (const key in obj) {
      const value = obj[key]
      if (typeof value !== 'object') {
        const asString = value
        if (registered != null && registered[asString] !== undefined) string += key + '{' + registered[asString] + '}'
        else if (isProcessableValue(asString)) string += processStyleName(key) + ':' + processStyleValue(key, asString) + ';'
      } else {
        if (key === 'NO_COMPONENT_SELECTOR' && isDevMode()) throw new Error(noComponentSelectorMessage)
        if (Array.isArray(value) && typeof value[0] === 'string' && (registered == null || registered[value[0]] === undefined)) {
          for (let i = 0; i < value.length; i++) {
            if (isProcessableValue(value[i])) string += processStyleName(key) + ':' + processStyleValue(key, value[i]) + ';'
          }
        } else {
          const interpolated = handleInterpolation(mergedProps, registered, value)
          switch (key) {
            case 'animation':
            case 'animationName':
              string += processStyleName(key) + ':' + interpolated + ';'
              break
            default:
              if (isDevMode() && key === 'undefined') console.error(UNDEFINED_AS_OBJECT_KEY_ERROR)
              string += key + '{' + interpolated + '}'
          }
        }
      }
    }
  }
  return string
}

/**
 * Emotion's `serializeStyles`, without the hash it puts at the start of `name`.
 * @returns The serialized styles, their `name` only the label suffix.
 */
export function serializeUnnamed(args: readonly any[], registered?: Registered, mergedProps?: unknown): SerializedStyles {
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && args[0].styles !== undefined) return args[0]
  let stringMode = true
  let styles = ''
  cursor = undefined
  const strings = args[0]
  if (strings == null || strings.raw === undefined) {
    stringMode = false
    styles += handleInterpolation(mergedProps, registered, strings)
  } else {
    if (isDevMode() && strings[0] === undefined) console.error(ILLEGAL_ESCAPE_SEQUENCE_ERROR)
    styles += strings[0]
  }
  for (let i = 1; i < args.length; i++) {
    styles += handleInterpolation(mergedProps, registered, args[i])
    if (stringMode) {
      if (isDevMode() && strings[i] === undefined) console.error(ILLEGAL_ESCAPE_SEQUENCE_ERROR)
      styles += strings[i]
    }
  }
  labelPattern.lastIndex = 0
  let identifierName = ''
  let match: RegExpExecArray | null
  while ((match = labelPattern.exec(styles)) !== null) identifierName += '-' + match[1]
  if (isDevMode()) {
    return {
      name: identifierName,
      styles,
      next: cursor,
      toString: () =>
        "You have tried to stringify object returned from `css` function. It isn't supposed to be used directly (e.g. as value of the `className` prop), but rather handed to emotion so it can handle it (e.g. as value of `css` prop).",
    } as SerializedStyles
  }
  return { name: identifierName, styles, next: cursor } as SerializedStyles
}
