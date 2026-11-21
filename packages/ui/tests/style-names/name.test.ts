// @vitest-environment node
//
// The name MeoNode gives a style: the first 64 bits of a SHA-256 of its whole
// text, as 13 base-36 characters, and the memo that saves hashing a text twice.
import { createHash } from 'node:crypto'
import { serializeStyles } from '@emotion/serialize'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __clearStyleNameMemo,
  __setStyleHash,
  __styleNameMemoSize,
  hashStyles,
  nameStyles,
  STYLE_NAME_MEMO_CHARACTERS,
  STYLE_NAME_MEMO_ENTRIES,
} from '@src/util/style-name.util.js'

afterEach(() => __setStyleHash())

/** Each UTF-16 unit as the UTF-8 encoding of its value, the bytes the name is hashed from. */
function unitBytes(text: string): Buffer {
  const out: number[] = []
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i)
    if (unit < 0x80) out.push(unit)
    else if (unit < 0x800) out.push(0xc0 | (unit >> 6), 0x80 | (unit & 0x3f))
    else out.push(0xe0 | (unit >> 12), 0x80 | ((unit >> 6) & 0x3f), 0x80 | (unit & 0x3f))
  }
  return Buffer.from(out)
}

/** The name node:crypto gives the same bytes: its first 64 bits in base 36, 13 characters. */
const reference = (text: string) => createHash('sha256').update(unitBytes(text)).digest().readBigUInt64BE(0).toString(36).padStart(13, '0')

const TEXTS = [
  '',
  'a',
  'flex-shrink:0;min-height:0;min-width:0;color:#02ab73;padding:4px;',
  // Padding boundaries: 55 bytes fit one block, 56 and 64 need a second.
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(64),
  // Two- and three-byte units, a surrogate pair, and lone surrogates.
  'content:"é";',
  'content:"中";',
  'content:"😀";',
  'content:"\uD800";',
  'content:"\uDFFF";',
  'é'.repeat(2000),
  'a'.repeat(5000),
]

describe('the name of a styles text', () => {
  // Forward, then back, so a short text follows a long one in the reused buffer.
  it.each([...TEXTS, ...[...TEXTS].reverse()].map(text => [text.slice(0, 24), text]))('is the first 64 bits of its SHA-256, in base 36: %j', (_, text) => {
    expect(hashStyles(text)).toBe(reference(text))
  })

  it('is 13 base-36 characters', () => {
    for (const text of TEXTS) expect(hashStyles(text)).toMatch(/^[0-9a-z]{13}$/)
  })

  it('differs for texts that differ only in a lone surrogate', () => {
    expect(hashStyles('content:"\uD800";')).not.toBe(hashStyles('content:"\uDBFF";'))
  })

  it('differs for texts that differ only in the high byte of a character', () => {
    expect(hashStyles('content:"a";')).not.toBe(hashStyles('content:"š";'))
  })

  // Emotion's name is a 32-bit hash in base 36, at most 7 characters, before any
  // label; a 13-character name can never be one, in a class or in a cache.
  it('can never equal a name Emotion gives', () => {
    expect((2 ** 32 - 1).toString(36)).toHaveLength(7)
    for (const text of TEXTS) {
      const emotion = serializeStyles([text as never]).name
      expect(emotion.split('-')[0].length).toBeLessThanOrEqual(7)
      expect(nameStyles(serializeStyles([text as never])).name).not.toBe(emotion)
    }
  })
})

describe('a serialized style under its MeoNode name', () => {
  it('keeps its styles, and Emotion’s label suffix', () => {
    const serialized = serializeStyles([{ label: 'card', color: 'red' } as never])
    const named = nameStyles(serialized)

    expect(serialized.name).toMatch(/-card$/)
    expect(named.styles).toBe(serialized.styles)
    expect(named.name).toBe(`${hashStyles(serialized.styles)}-card`)
  })

  it('is named from its whole text, not from Emotion’s name', () => {
    const named = nameStyles({ name: 'same', styles: 'color:red;' } as never)
    const other = nameStyles({ name: 'same', styles: 'color:blue;' } as never)

    expect(named.name).not.toBe(other.name)
  })
})

describe('the memo of names', () => {
  const texts = (count: number, from = 0, width = 0) => Array.from({ length: count }, (_, i) => `color:#${(from + i).toString(16)};${'x'.repeat(width)}`)

  it('hashes a text once while it holds it', () => {
    let calls = 0
    __setStyleHash(text => {
      calls++
      return hashStyles(text)
    })
    for (let round = 0; round < 3; round++) for (const text of texts(100)) nameStyles({ name: 'x', styles: text } as never)

    expect(calls).toBe(100)
  })

  it(`holds at most ${STYLE_NAME_MEMO_ENTRIES} texts, and names correctly at its limit`, () => {
    __clearStyleNameMemo()
    let most = 0
    for (const text of texts(3 * STYLE_NAME_MEMO_ENTRIES)) {
      expect(nameStyles({ name: 'x', styles: text } as never).name).toBe(hashStyles(text))
      most = Math.max(most, __styleNameMemoSize().entries)
    }

    expect(most).toBe(STYLE_NAME_MEMO_ENTRIES)
  })

  it(`holds at most ${STYLE_NAME_MEMO_CHARACTERS} characters of text`, () => {
    __clearStyleNameMemo()
    let most = 0
    for (const text of texts(2000, 0, 10_000)) {
      nameStyles({ name: 'x', styles: text } as never)
      most = Math.max(most, __styleNameMemoSize().characters)
    }

    expect(most).toBeLessThanOrEqual(STYLE_NAME_MEMO_CHARACTERS)
    expect(most).toBeGreaterThan(STYLE_NAME_MEMO_CHARACTERS / 2)
  })

  // A page whose renders go through the same 15,000 styles again and again, as
  // one of about 10,000 styled nodes does when it mounts and then updates.
  it('hashes a cycle of 15,000 texts only on its first pass', () => {
    __clearStyleNameMemo()
    let calls = 0
    __setStyleHash(text => {
      calls++
      return hashStyles(text)
    })
    const cycle = texts(15_000)
    for (const text of cycle) nameStyles({ name: 'x', styles: text } as never)
    const first = calls
    for (let pass = 0; pass < 3; pass++) for (const text of cycle) nameStyles({ name: 'x', styles: text } as never)

    expect(first).toBe(15_000)
    expect(calls - first).toBe(0)
  })

  it('keeps no text longer than half its characters, and still names it', () => {
    __clearStyleNameMemo()
    const text = 'x'.repeat(STYLE_NAME_MEMO_CHARACTERS / 2 + 1)

    expect(nameStyles({ name: 'x', styles: text } as never).name).toBe(hashStyles(text))
    expect(__styleNameMemoSize().entries).toBe(0)
  })

  it('keeps a text rendered again within half its limit through a change of generation', () => {
    __clearStyleNameMemo()
    let calls = 0
    __setStyleHash(text => {
      calls++
      return hashStyles(text)
    })
    const kept = texts(1, -1)[0]
    nameStyles({ name: 'x', styles: kept } as never)
    for (const text of texts(STYLE_NAME_MEMO_ENTRIES / 2)) nameStyles({ name: 'x', styles: text } as never)
    const before = calls
    nameStyles({ name: 'x', styles: kept } as never)

    expect(calls).toBe(before)
  })
})
