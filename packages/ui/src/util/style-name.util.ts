import type { SerializedStyles } from '@emotion/serialize'
import { serializeUnnamed } from '@src/util/serialize-styles.util.js'

/**
 * The name MeoNode gives a style, in place of the one Emotion computes.
 *
 * Emotion names a style by a 32-bit hash of its serialized text, so two different
 * styles can share a name, and Emotion inserts and registers by name alone. This
 * name is the first 64 bits of a BLAKE3 digest of the whole text, every bit of
 * every UTF-16 unit, written as 13 base-32 characters: finding a second text
 * with a given name takes about 2⁶⁴ work. It is a pure function of the text, so
 * the server, the browser, the React Server Components layer and the compiler
 * (`crates/meonode-swc-plugin/src/style_name.rs`) all form the same one, and
 * hydration matches.
 *
 * Emotion's own names are at most 7 characters before any `-`, so a 13-character
 * name never equals one: `@meonode/mui`, and code that uses Emotion directly,
 * share a cache with MeoNode without ever meeting its names.
 */

/** BLAKE3's initial value, the same eight words as SHA-256's. */
const IV0 = 0x6a09e667
const IV1 = 0xbb67ae85
const IV2 = 0x3c6ef372
const IV3 = 0xa54ff53a
const IV4 = 0x510e527f
const IV5 = 0x9b05688c
const IV6 = 0x1f83d9ab
const IV7 = 0x5be0cd19

/** BLAKE3's flags. */
const CHUNK_START = 1
const CHUNK_END = 2
const PARENT = 4
const ROOT = 8

/** Bytes in a BLAKE3 chunk: the leaves of its tree. */
const CHUNK = 1024

/** The message word each of a round's sixteen steps reads, for all seven rounds: BLAKE3's permutation applied once per round. */
const SCHEDULE = /* @__PURE__ */ (() => {
  const permutation = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8]
  const schedule = new Uint8Array(112)
  let order = Array.from({ length: 16 }, (_, i) => i)
  for (let round = 0; round < 7; round++) {
    schedule.set(order, round * 16)
    order = permutation.map(i => order[i])
  }
  return schedule
})()

/** The block being compressed, as sixteen little-endian words, reused by every call. */
const M = /* @__PURE__ */ new Uint32Array(16)

/** The chaining values of completed subtrees, eight words each, reused and grown as needed. */
let stack = new Uint32Array(8 * 8)

/** The bytes of a text that is not ASCII, reused by every call and grown as needed. */
let bytes = new Uint8Array(1024)

/** The first eight words of the last compression's output, its chaining value. */
let o0 = 0
let o1 = 0
let o2 = 0
let o3 = 0
let o4 = 0
let o5 = 0
let o6 = 0
let o7 = 0

/**
 * BLAKE3's compression of {@link M} under the chaining value `c0`…`c7`, into
 * `o0`…`o7`. The state stays in locals: one round's eight steps are written
 * once, inside the loop over the rounds.
 */
function compress(
  c0: number,
  c1: number,
  c2: number,
  c3: number,
  c4: number,
  c5: number,
  c6: number,
  c7: number,
  counter: number,
  length: number,
  flags: number,
): void {
  let v0 = c0,
    v1 = c1,
    v2 = c2,
    v3 = c3,
    v4 = c4,
    v5 = c5,
    v6 = c6,
    v7 = c7
  let v8 = IV0,
    v9 = IV1,
    v10 = IV2,
    v11 = IV3
  let v12 = counter | 0,
    v13 = (counter / 0x100000000) | 0,
    v14 = length,
    v15 = flags
  const m = M
  const s = SCHEDULE
  for (let at = 0; at < 112; at += 16) {
    v0 = (v0 + v4 + m[s[at]]) | 0
    v12 ^= v0
    v12 = (v12 >>> 16) | (v12 << 16)
    v8 = (v8 + v12) | 0
    v4 ^= v8
    v4 = (v4 >>> 12) | (v4 << 20)
    v0 = (v0 + v4 + m[s[at + 1]]) | 0
    v12 ^= v0
    v12 = (v12 >>> 8) | (v12 << 24)
    v8 = (v8 + v12) | 0
    v4 ^= v8
    v4 = (v4 >>> 7) | (v4 << 25)
    v1 = (v1 + v5 + m[s[at + 2]]) | 0
    v13 ^= v1
    v13 = (v13 >>> 16) | (v13 << 16)
    v9 = (v9 + v13) | 0
    v5 ^= v9
    v5 = (v5 >>> 12) | (v5 << 20)
    v1 = (v1 + v5 + m[s[at + 3]]) | 0
    v13 ^= v1
    v13 = (v13 >>> 8) | (v13 << 24)
    v9 = (v9 + v13) | 0
    v5 ^= v9
    v5 = (v5 >>> 7) | (v5 << 25)
    v2 = (v2 + v6 + m[s[at + 4]]) | 0
    v14 ^= v2
    v14 = (v14 >>> 16) | (v14 << 16)
    v10 = (v10 + v14) | 0
    v6 ^= v10
    v6 = (v6 >>> 12) | (v6 << 20)
    v2 = (v2 + v6 + m[s[at + 5]]) | 0
    v14 ^= v2
    v14 = (v14 >>> 8) | (v14 << 24)
    v10 = (v10 + v14) | 0
    v6 ^= v10
    v6 = (v6 >>> 7) | (v6 << 25)
    v3 = (v3 + v7 + m[s[at + 6]]) | 0
    v15 ^= v3
    v15 = (v15 >>> 16) | (v15 << 16)
    v11 = (v11 + v15) | 0
    v7 ^= v11
    v7 = (v7 >>> 12) | (v7 << 20)
    v3 = (v3 + v7 + m[s[at + 7]]) | 0
    v15 ^= v3
    v15 = (v15 >>> 8) | (v15 << 24)
    v11 = (v11 + v15) | 0
    v7 ^= v11
    v7 = (v7 >>> 7) | (v7 << 25)
    v0 = (v0 + v5 + m[s[at + 8]]) | 0
    v15 ^= v0
    v15 = (v15 >>> 16) | (v15 << 16)
    v10 = (v10 + v15) | 0
    v5 ^= v10
    v5 = (v5 >>> 12) | (v5 << 20)
    v0 = (v0 + v5 + m[s[at + 9]]) | 0
    v15 ^= v0
    v15 = (v15 >>> 8) | (v15 << 24)
    v10 = (v10 + v15) | 0
    v5 ^= v10
    v5 = (v5 >>> 7) | (v5 << 25)
    v1 = (v1 + v6 + m[s[at + 10]]) | 0
    v12 ^= v1
    v12 = (v12 >>> 16) | (v12 << 16)
    v11 = (v11 + v12) | 0
    v6 ^= v11
    v6 = (v6 >>> 12) | (v6 << 20)
    v1 = (v1 + v6 + m[s[at + 11]]) | 0
    v12 ^= v1
    v12 = (v12 >>> 8) | (v12 << 24)
    v11 = (v11 + v12) | 0
    v6 ^= v11
    v6 = (v6 >>> 7) | (v6 << 25)
    v2 = (v2 + v7 + m[s[at + 12]]) | 0
    v13 ^= v2
    v13 = (v13 >>> 16) | (v13 << 16)
    v8 = (v8 + v13) | 0
    v7 ^= v8
    v7 = (v7 >>> 12) | (v7 << 20)
    v2 = (v2 + v7 + m[s[at + 13]]) | 0
    v13 ^= v2
    v13 = (v13 >>> 8) | (v13 << 24)
    v8 = (v8 + v13) | 0
    v7 ^= v8
    v7 = (v7 >>> 7) | (v7 << 25)
    v3 = (v3 + v4 + m[s[at + 14]]) | 0
    v14 ^= v3
    v14 = (v14 >>> 16) | (v14 << 16)
    v9 = (v9 + v14) | 0
    v4 ^= v9
    v4 = (v4 >>> 12) | (v4 << 20)
    v3 = (v3 + v4 + m[s[at + 15]]) | 0
    v14 ^= v3
    v14 = (v14 >>> 8) | (v14 << 24)
    v9 = (v9 + v14) | 0
    v4 ^= v9
    v4 = (v4 >>> 7) | (v4 << 25)
  }
  o0 = v0 ^ v8
  o1 = v1 ^ v9
  o2 = v2 ^ v10
  o3 = v3 ^ v11
  o4 = v4 ^ v12
  o5 = v5 ^ v13
  o6 = v6 ^ v14
  o7 = v7 ^ v15
}

/**
 * Loads the block at `offset` of an ASCII `text` into {@link M}, four units to a
 * word and zero past the end.
 * @returns False at a unit above 0x7f: the text is hashed from its bytes instead.
 */
function loadText(text: string, offset: number, length: number): boolean {
  for (let i = 0; i < 16; i++) {
    const at = offset + 4 * i
    let u0 = 0,
      u1 = 0,
      u2 = 0,
      u3 = 0
    if (at + 3 < length) {
      u0 = text.charCodeAt(at)
      u1 = text.charCodeAt(at + 1)
      u2 = text.charCodeAt(at + 2)
      u3 = text.charCodeAt(at + 3)
    } else {
      if (at < length) u0 = text.charCodeAt(at)
      if (at + 1 < length) u1 = text.charCodeAt(at + 1)
      if (at + 2 < length) u2 = text.charCodeAt(at + 2)
    }
    if ((u0 | u1 | u2 | u3) > 0x7f) return false
    M[i] = u0 | (u1 << 8) | (u2 << 16) | (u3 << 24)
  }
  return true
}

/** Loads the block at `offset` of the first `length` of {@link bytes} into {@link M}, zero past the end. */
function loadBytes(offset: number, length: number): void {
  for (let i = 0; i < 16; i++) {
    const at = offset + 4 * i
    let word = 0
    for (let k = 3; k >= 0; k--) word = (word << 8) | (at + k < length ? bytes[at + k] : 0)
    M[i] = word
  }
}

/**
 * Writes `text` into {@link bytes}, each UTF-16 unit as the UTF-8 encoding of its
 * value, one to three bytes. Unlike UTF-8 of the whole string, a lone surrogate
 * keeps its own bytes rather than becoming U+FFFD, so two different texts never
 * share them. ASCII text gives the same bytes as its units.
 * @returns How many bytes were written.
 */
function encode(text: string): number {
  const most = text.length * 3
  if (bytes.length < most) bytes = new Uint8Array(most * 2)
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i)
    if (unit < 0x80) bytes[n++] = unit
    else if (unit < 0x800) {
      bytes[n++] = 0xc0 | (unit >> 6)
      bytes[n++] = 0x80 | (unit & 0x3f)
    } else {
      bytes[n++] = 0xe0 | (unit >> 12)
      bytes[n++] = 0x80 | ((unit >> 6) & 0x3f)
      bytes[n++] = 0x80 | (unit & 0x3f)
    }
  }
  return n
}

/** BLAKE3 of an ASCII text of at most one chunk, read from its units. @returns False when the text is not one. */
function hashShortText(text: string): boolean {
  const length = text.length
  if (length > CHUNK) return false
  const blocks = length === 0 ? 1 : (length + 63) >> 6
  let c0 = IV0,
    c1 = IV1,
    c2 = IV2,
    c3 = IV3,
    c4 = IV4,
    c5 = IV5,
    c6 = IV6,
    c7 = IV7
  for (let block = 0; block < blocks; block++) {
    const offset = block << 6
    if (!loadText(text, offset, length)) return false
    const last = block === blocks - 1
    compress(c0, c1, c2, c3, c4, c5, c6, c7, 0, last ? length - offset : 64, (block === 0 ? CHUNK_START : 0) | (last ? CHUNK_END | ROOT : 0))
    c0 = o0
    c1 = o1
    c2 = o2
    c3 = o3
    c4 = o4
    c5 = o5
    c6 = o6
    c7 = o7
  }
  return true
}

/** Compresses the parent of the subtree at `depth` of {@link stack} and the chaining value `c`, into `o0`…`o7`. */
function parent(depth: number, c0: number, c1: number, c2: number, c3: number, c4: number, c5: number, c6: number, c7: number, flags: number): void {
  for (let i = 0; i < 8; i++) M[i] = stack[depth * 8 + i]
  M[8] = c0
  M[9] = c1
  M[10] = c2
  M[11] = c3
  M[12] = c4
  M[13] = c5
  M[14] = c6
  M[15] = c7
  compress(IV0, IV1, IV2, IV3, IV4, IV5, IV6, IV7, 0, 64, PARENT | flags)
}

/** BLAKE3 of the first `length` bytes of {@link bytes}, of any length, into `o0`…`o7`. */
function hashBytes(length: number): void {
  const chunks = length === 0 ? 1 : Math.ceil(length / CHUNK)
  if (stack.length < chunks * 8) stack = new Uint32Array(chunks * 16)
  let depth = 0
  for (let chunk = 0; chunk < chunks; chunk++) {
    const start = chunk * CHUNK
    const end = Math.min(length, start + CHUNK)
    const blocks = end === start ? 1 : (end - start + 63) >> 6
    let c0 = IV0,
      c1 = IV1,
      c2 = IV2,
      c3 = IV3,
      c4 = IV4,
      c5 = IV5,
      c6 = IV6,
      c7 = IV7
    for (let block = 0; block < blocks; block++) {
      const offset = start + (block << 6)
      loadBytes(offset, end)
      const last = block === blocks - 1
      compress(
        c0,
        c1,
        c2,
        c3,
        c4,
        c5,
        c6,
        c7,
        chunk,
        Math.min(64, end - offset),
        (block === 0 ? CHUNK_START : 0) | (last ? CHUNK_END : 0) | (last && chunks === 1 ? ROOT : 0),
      )
      c0 = o0
      c1 = o1
      c2 = o2
      c3 = o3
      c4 = o4
      c5 = o5
      c6 = o6
      c7 = o7
    }
    if (chunks === 1) return
    if (chunk < chunks - 1) {
      // A completed subtree merges with those before it as often as the chunk count has trailing zeros.
      for (let total = chunk + 1; (total & 1) === 0; total >>= 1) {
        depth--
        parent(depth, c0, c1, c2, c3, c4, c5, c6, c7, 0)
        c0 = o0
        c1 = o1
        c2 = o2
        c3 = o3
        c4 = o4
        c5 = o5
        c6 = o6
        c7 = o7
      }
      const at = depth * 8
      stack[at] = c0
      stack[at + 1] = c1
      stack[at + 2] = c2
      stack[at + 3] = c3
      stack[at + 4] = c4
      stack[at + 5] = c5
      stack[at + 6] = c6
      stack[at + 7] = c7
      depth++
    } else {
      while (depth > 0) {
        depth--
        parent(depth, c0, c1, c2, c3, c4, c5, c6, c7, depth === 0 ? ROOT : 0)
        c0 = o0
        c1 = o1
        c2 = o2
        c3 = o3
        c4 = o4
        c5 = o5
        c6 = o6
        c7 = o7
      }
    }
  }
}

/** The character codes of the 32 digits. */
const DIGITS = /* @__PURE__ */ Uint8Array.from('0123456789abcdefghijklmnopqrstuv', digit => digit.charCodeAt(0))

/** A little-endian word's bytes in big-endian order: the digest's bytes read as one number. */
const swap = (word: number): number => ((word >>> 24) | ((word >>> 8) & 0xff00) | ((word << 8) & 0xff0000) | (word << 24)) >>> 0

/**
 * The 64-bit value `high · 2³² + low` in exactly 13 base-32 characters: four
 * bits, then twelve groups of five, each found by shifts.
 */
export function base32(high: number, low: number): string {
  return String.fromCharCode(
    DIGITS[high >>> 28],
    DIGITS[(high >>> 23) & 31],
    DIGITS[(high >>> 18) & 31],
    DIGITS[(high >>> 13) & 31],
    DIGITS[(high >>> 8) & 31],
    DIGITS[(high >>> 3) & 31],
    DIGITS[((high & 7) << 2) | (low >>> 30)],
    DIGITS[(low >>> 25) & 31],
    DIGITS[(low >>> 20) & 31],
    DIGITS[(low >>> 15) & 31],
    DIGITS[(low >>> 10) & 31],
    DIGITS[(low >>> 5) & 31],
    DIGITS[low & 31],
  )
}

/**
 * The 13-character name of a styles text: the first 64 bits of its BLAKE3
 * digest, in base 32.
 * @returns The name, before any label.
 */
export function hashStyles(styles: string): string {
  if (!hashShortText(styles)) hashBytes(encode(styles))
  return base32(swap(o0), swap(o1))
}

/**
 * Test seam: the name of any bytes, hashed on the byte path, so tests can check
 * the hash against BLAKE3's own vectors and the ASCII path against it.
 * @returns The 13-character name, as {@link hashStyles} writes it.
 */
export function __nameBytes(input: Uint8Array): string {
  if (bytes.length < input.length) bytes = new Uint8Array(input.length * 2)
  bytes.set(input)
  hashBytes(input.length)
  return base32(swap(o0), swap(o1))
}

/** The most texts the memo of names keeps, across both its generations. */
export const STYLE_NAME_MEMO_ENTRIES = 40_000

/** The most characters of text the memo of names keeps, across both its generations. */
export const STYLE_NAME_MEMO_CHARACTERS = 4 * 1024 * 1024

/** A generation of the memo: names by text, and how many characters of text it holds. */
interface Generation {
  names: Map<string, string>
  characters: number
}

let current: Generation = { names: new Map(), characters: 0 }
let previous: Generation = { names: new Map(), characters: 0 }

/** The hash that names a text: {@link hashStyles}, unless a test replaced it. */
let hash = hashStyles

function remember(styles: string, name: string): void {
  if (current.names.size >= STYLE_NAME_MEMO_ENTRIES / 2 || current.characters + styles.length > STYLE_NAME_MEMO_CHARACTERS / 2) {
    previous = current
    current = { names: new Map(), characters: 0 }
  }
  current.names.set(styles, name)
  current.characters += styles.length
}

/**
 * The name of a styles text, from the memo when it holds the text.
 *
 * The memo is keyed by the text itself, so it can only return the text's own
 * name. It is two generations of half its limits each: a text found in the older
 * one moves to the newer, and when the newer fills, the older is dropped whole.
 * Every operation is constant time, and a text rendered again within half the
 * limits is never hashed twice.
 */
function nameOf(styles: string): string {
  const known = current.names.get(styles)
  if (known !== undefined) return known
  let name = previous.names.get(styles)
  if (name === undefined) name = hash(styles)
  // Too long to be worth its memory: hashed again each time.
  if (styles.length <= STYLE_NAME_MEMO_CHARACTERS / 2) remember(styles, name)
  return name
}

/**
 * `serialized` under MeoNode's name for its styles. Emotion's label suffix, the
 * part of its name from the first `-`, is kept, so development class names still
 * carry the labels.
 * @returns A copy whose `name` is MeoNode's.
 */
export function nameStyles(serialized: SerializedStyles): SerializedStyles {
  const label = serialized.name.indexOf('-')
  const name = nameOf(serialized.styles)
  return { ...serialized, name: label === -1 ? name : name + serialized.name.slice(label) }
}

/** Text that serializing reads more of than its characters: a label it names, or keyframes it reports in development. */
const SERIALIZE_READS = /label:|_EMO_/

/**
 * The name `nameStyles(serializeUnnamed([text]))` gives a lone string, without
 * serializing it. Serializing a string keeps its text as it is; only a label in
 * it adds to the name, and a keyframes value interpolated into it is reported,
 * so those still go through the serializer.
 * @param text A whole style's serialized text.
 * @returns Its name.
 */
export function nameText(text: string): string {
  return SERIALIZE_READS.test(text) ? nameStyles(serializeUnnamed([text] as never)).name : nameOf(text)
}

/** Test seam: how many texts the memo holds, and how many characters of text. */
export const __styleNameMemoSize = (): { entries: number; characters: number } => ({
  entries: current.names.size + previous.names.size,
  characters: current.characters + previous.characters,
})

/** Test seam: empties the memo. */
export const __clearStyleNameMemo = (): void => {
  current = { names: new Map(), characters: 0 }
  previous = { names: new Map(), characters: 0 }
}

/**
 * Test seam: names texts with `replacement` instead of {@link hashStyles}, or
 * restores it when given nothing. Empties the memo either way.
 */
export const __setStyleHash = (replacement?: (styles: string) => string): void => {
  hash = replacement ?? hashStyles
  __clearStyleNameMemo()
}
