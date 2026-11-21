import type { SerializedStyles } from '@emotion/serialize'

/**
 * The name MeoNode gives a style, in place of the one Emotion computes.
 *
 * Emotion names a style by a 32-bit hash of its serialized text, so two different
 * styles can share a name, and Emotion inserts and registers by name alone. This
 * name is the first 64 bits of a SHA-256 of the whole text, every bit of every
 * UTF-16 unit, written as 13 base-36 characters. It is a pure function of the
 * text, so the server, the browser and the React Server Components layer all
 * form the same one, and hydration matches.
 *
 * Emotion's own names are at most 7 characters before any `-`, so a 13-character
 * name never equals one: `@meonode/mui`, and code that uses Emotion directly,
 * share a cache with MeoNode without ever meeting its names.
 */

/** SHA-256's round constants. */
const K = /* @__PURE__ */ Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74,
  0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
  0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e,
  0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** The message schedule, reused by every call. */
const W = /* @__PURE__ */ new Uint32Array(64)

/** The bytes of the text being hashed, reused by every call and grown as needed. */
let bytes = new Uint8Array(1024)

/** 36⁶: the base-36 value of the last six characters of a name. */
const BASE36_LOW = 36 ** 6

/**
 * Writes `text` as bytes, each UTF-16 unit as the UTF-8 encoding of its value, one
 * to three bytes. Unlike UTF-8 of the whole string, a lone surrogate keeps its own
 * bytes rather than becoming U+FFFD, so two different texts never share them.
 * @returns How many bytes were written.
 */
function encode(text: string): number {
  // At most three bytes per unit, plus SHA-256's padding and length.
  const most = text.length * 3 + 72
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

/**
 * The first 64 bits of the SHA-256 of `length` bytes in {@link bytes}, as two
 * 32-bit halves.
 */
function sha256Prefix(length: number): [number, number] {
  const blocks = ((length + 9 + 63) >> 6) << 6
  bytes[length] = 0x80
  bytes.fill(0, length + 1, blocks - 4)
  const bits = length * 8
  bytes[blocks - 4] = bits >>> 24
  bytes[blocks - 3] = bits >>> 16
  bytes[blocks - 2] = bits >>> 8
  bytes[blocks - 1] = bits
  let a0 = 0x6a09e667
  let b0 = 0xbb67ae85
  let c0 = 0x3c6ef372
  let d0 = 0xa54ff53a
  let e0 = 0x510e527f
  let f0 = 0x9b05688c
  let g0 = 0x1f83d9ab
  let h0 = 0x5be0cd19
  for (let offset = 0; offset < blocks; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const at = offset + 4 * i
      W[i] = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]
    }
    for (let i = 16; i < 64; i++) {
      const x = W[i - 15]
      const y = W[i - 2]
      W[i] =
        (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) +
        W[i - 16] +
        (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) +
        W[i - 7]
    }
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    let e = e0
    let f = f0
    let g = g0
    let h = h0
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
    e0 = (e0 + e) | 0
    f0 = (f0 + f) | 0
    g0 = (g0 + g) | 0
    h0 = (h0 + h) | 0
  }
  return [a0 >>> 0, b0 >>> 0]
}

/**
 * The 64-bit value `high · 2³² + low` in exactly 13 base-36 characters. Divides on
 * 16-bit limbs so every step stays an exact integer in a double.
 */
function base36(high: number, low: number): string {
  const limbs = [high >>> 16, high & 0xffff, low >>> 16, low & 0xffff]
  let rest = 0
  let quotient = 0
  for (const limb of limbs) {
    const current = rest * 0x10000 + limb
    const digit = Math.floor(current / BASE36_LOW)
    rest = current - digit * BASE36_LOW
    quotient = quotient * 0x10000 + digit
  }
  return quotient.toString(36).padStart(7, '0') + rest.toString(36).padStart(6, '0')
}

/**
 * The 13-character name of a styles text.
 * @returns The name, before any label.
 */
export function hashStyles(styles: string): string {
  const [high, low] = sha256Prefix(encode(styles))
  return base36(high, low)
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
