// @vitest-environment node
//
// The name MeoNode gives a style: the first 64 bits of a BLAKE3 digest of its
// whole text, as 13 base-32 characters, and the memo that saves hashing a text
// twice.
import { serializeStyles } from '@emotion/serialize'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __clearStyleNameMemo,
  __setStyleHash,
  __styleNameMemoSize,
  __nameBytes,
  base32,
  hashStyles,
  nameStyles,
  nameText,
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

/** A 64-bit value, given as 16 hex digits, in 13 base-32 characters. */
const base32Of = (hex: string) => BigInt(`0x${hex}`).toString(32).padStart(13, '0')

/**
 * The first 64 bits of BLAKE3's own test vectors, as the `blake3` crate 1.8.7
 * hashes them: an input of each length whose byte `i` is `i % 251`. The lengths
 * cross a block (64 bytes), a chunk (1024) and every depth of the chunk tree
 * up to 100 chunks.
 */
const VECTORS: Record<number, string> = {
  0: 'af1349b9f5f9a1a6',
  1: '2d3adedff11b61f1',
  63: 'e9bc37a594daad83',
  64: '4eed7141ea4a5cd4',
  65: 'de1e5fa0be70df6d',
  1023: '10108970eeda3eb9',
  1024: '42214739f095a406',
  1025: 'd00278ae47eb27b3',
  2048: 'e776b6028c7cd22a',
  2049: '5f4d72f40d7a5f82',
  3072: 'b98cb0ff3623be03',
  3073: '7124b49501012f81',
  4096: '015094013f57a527',
  4097: '9b4052b38f1c5fc8',
  5120: '9cadc15fed8b5d85',
  5121: '628bd2cb2004694a',
  6144: '3e2e5b74e048f3ad',
  6145: 'f1323a8631446cc5',
  7168: '61da957ec2499a95',
  7169: 'a003fc7a51754a9b',
  8192: 'aae792484c8efe4f',
  8193: 'bab6c09cb8ce8cf4',
  16384: 'f875d6646de28985',
  31744: '62b6960e1a44bcc1',
  102400: 'bc3e3d41a1146b06',
}

const TEXTS = [
  '',
  'a',
  'flex-shrink:0;min-height:0;min-width:0;color:#02ab73;padding:4px;',
  // Block and chunk boundaries, read from the units: a block is 64 bytes, a
  // chunk 1024, and a text longer than a chunk is hashed from its bytes.
  'x'.repeat(63),
  'x'.repeat(64),
  'x'.repeat(65),
  'x'.repeat(1023),
  'x'.repeat(1024),
  'x'.repeat(1025),
  // A unit above 0x7f after whole blocks were read from the units, and in the
  // last unit of a word.
  'x'.repeat(130) + 'é',
  'xyz' + 'é',
  // Two- and three-byte units, a surrogate pair, and lone surrogates.
  'content:"é";',
  'content:"中";',
  'content:"😀";',
  'content:"\uD800";',
  'content:"\uDFFF";',
  'é'.repeat(2000),
  'a'.repeat(5000),
  '中'.repeat(700),
]

describe('the name of a styles text', () => {
  it.each(Object.entries(VECTORS))('hashes BLAKE3’s %s-byte test vector to its first 64 bits', (length, prefix) => {
    const input = Uint8Array.from({ length: Number(length) }, (_, i) => i % 251)
    expect(__nameBytes(input)).toBe(base32Of(prefix))
  })

  // Forward, then back, so a short text follows a long one in the reused buffers.
  it.each([...TEXTS, ...[...TEXTS].reverse()].map(text => [text.slice(0, 24), text]))(
    'is the BLAKE3 of each unit’s UTF-8 encoding, read from the units or the bytes alike: %j',
    (_, text) => {
      expect(hashStyles(text)).toBe(__nameBytes(unitBytes(text)))
    },
  )

  it('is pinned: a change here renames every class in every app, and the compiler’s too', () => {
    expect(hashStyles('a')).toBe('1ethfrncmj92j')
  })

  it('writes a 64-bit value as exactly its 13 base-32 digits', () => {
    const digits = (high: number, low: number) => ((BigInt(high) << 32n) + BigInt(low)).toString(32).padStart(13, '0')
    // Each digit's place-value boundaries, across the two halves.
    const edges = [0, 1, 7, 8, 31, 32, 2 ** 25 - 1, 2 ** 25, 2 ** 28 - 1, 2 ** 28, 2 ** 30 - 1, 2 ** 30, 2 ** 31, 2 ** 32 - 1]
    for (const high of edges) for (const low of edges) expect(base32(high, low)).toBe(digits(high, low))
    // A fixed sequence of values over the whole range (xorshift32, seeded).
    let seed = 0x2545f491
    const next = () => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return seed >>> 0
    }
    let wrong = 0
    for (let i = 0; i < 200_000; i++) {
      const high = next()
      const low = next()
      if (base32(high, low) !== digits(high, low)) wrong++
    }
    expect(wrong).toBe(0)
  })

  it('is 13 base-32 characters', () => {
    for (const text of TEXTS) expect(hashStyles(text)).toMatch(/^[0-9a-v]{13}$/)
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

describe('a lone text under its MeoNode name', () => {
  it.each([
    ['a plain text', 'flex-shrink:0;color:red;&:hover{color:blue;}'],
    ['a text with a label', 'label:card;color:red;'],
    ['a text with two labels', 'label:card;color:red;label:wide;'],
    ['a text holding keyframes written as a string', 'animation:_EMO_abc_@keyframes abc{from{opacity:0;}}_EMO_ 1s;'],
    ['an empty text', ''],
    ['a text holding a source map comment', 'color:red;/*# sourceMappingURL=data:application/json;base64,e30= */'],
  ])('is the name Emotion’s serialization gives it, for %s, with the same reports', (_, text) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const name = nameText(text)
    const reports = error.mock.calls.length
    const emotion = serializeStyles([text] as never)
    expect(name).toBe(nameStyles(emotion).name)
    // The node keeps the text it was handed, so Emotion must keep it too.
    expect(emotion.styles).toBe(text)
    expect(error.mock.calls.length).toBe(2 * reports)
    error.mockRestore()
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
