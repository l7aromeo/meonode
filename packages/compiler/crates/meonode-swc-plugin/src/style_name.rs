//! Class names for extracted rules: the first 64 bits of a BLAKE3 digest,
//! written as 13 base-32 digits, as `@meonode/ui`'s `hashStyles` writes them.
//!
//! The runtime hashes the UTF-16 code units of a JavaScript string, each one
//! encoded on its own as one to three bytes: the same bytes as UTF-8 for every
//! character in the Basic Multilingual Plane, and three bytes per surrogate for
//! one outside it. The two must agree, or a name the runtime checks against its
//! text would read as a collision, so this hashes the same bytes.

/// The prefix every extracted class carries, so it never meets Emotion's `css-`
/// names, a user's class or another library's.
pub const CLASS_PREFIX: &str = "mn-";

/// Digits of the base-32 encoding, as the runtime writes them.
const BASE32_DIGITS: &[u8; 32] = b"0123456789abcdefghijklmnopqrstuv";

/// Width of the encoding: 64 bits are one digit of 4 bits and twelve of 5.
const NAME_DIGITS: usize = 13;

/// The bytes `hashStyles` feeds BLAKE3 for `text`.
fn runtime_bytes(text: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(text.len());
    for unit in text.encode_utf16() {
        let unit = u32::from(unit);
        if unit < 0x80 {
            bytes.push(unit as u8);
        } else if unit < 0x800 {
            bytes.push((0xc0 | (unit >> 6)) as u8);
            bytes.push((0x80 | (unit & 0x3f)) as u8);
        } else {
            bytes.push((0xe0 | (unit >> 12)) as u8);
            bytes.push((0x80 | ((unit >> 6) & 0x3f)) as u8);
            bytes.push((0x80 | (unit & 0x3f)) as u8);
        }
    }
    bytes
}

/// The 13-digit base-32 hash of `text`, identical to `hashStyles(text)`.
pub fn hash_styles(text: &str) -> String {
    let digest = blake3::hash(&runtime_bytes(text));
    let mut prefix = [0u8; 8];
    prefix.copy_from_slice(&digest.as_bytes()[..8]);
    let value = u64::from_be_bytes(prefix);
    let mut out = [b'0'; NAME_DIGITS];
    for (place, slot) in out.iter_mut().enumerate() {
        let shift = 5 * (NAME_DIGITS - 1 - place);
        *slot = BASE32_DIGITS[((value >> shift) & 31) as usize];
    }
    out.iter().map(|&b| b as char).collect()
}

/// A class name for `text`: [`CLASS_PREFIX`] and its hash.
pub fn class_name(text: &str) -> String {
    let mut name = String::with_capacity(CLASS_PREFIX.len() + NAME_DIGITS);
    name.push_str(CLASS_PREFIX);
    name.push_str(&hash_styles(text));
    name
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Names `@meonode/ui`'s own `hashStyles` gave these texts, written by
    /// `scripts/codegen-extract-tables.ts`.
    const RUNTIME_NAMES: &str = include_str!("../tests/fixture/extract/style-names.json");

    #[test]
    fn matches_the_runtime_on_every_sample() {
        let cases: Vec<(String, String)> =
            serde_json::from_str(RUNTIME_NAMES).expect("fixture parses");
        assert!(!cases.is_empty());
        for (text, expected) in cases {
            assert_eq!(hash_styles(&text), expected, "text {text:?}");
        }
    }

    #[test]
    fn names_are_stable() {
        // Pinned: a change here renames every extracted class in every app.
        assert_eq!(
            class_name("\u{0}padding\u{0}8px"),
            format!("mn-{}", hash_styles("\u{0}padding\u{0}8px"))
        );
        assert_eq!(class_name("a"), "mn-1ethfrncmj92j");
        assert_eq!(class_name("a").len(), CLASS_PREFIX.len() + NAME_DIGITS);
    }

    #[test]
    fn is_the_digest_prefix_in_base_32() {
        // BLAKE3 of no bytes begins af1349b9f5f9a1a6, and of "a" 17762fddd969a453;
        // in base 32, `BigInt.prototype.toString(32)`'s digits.
        assert_eq!(hash_styles(""), "au4q9n7qvj8d6");
        assert_eq!(hash_styles("a"), "1ethfrncmj92j");
    }

    #[test]
    fn every_bit_of_every_character_counts() {
        // Emotion's murmur2 keeps the low byte of each code unit, so these two
        // always collide there.
        assert_ne!(hash_styles("a"), hash_styles("š"));
    }
}
