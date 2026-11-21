//! Class names for extracted rules: the first 64 bits of SHA-256, written as 13
//! base-36 digits, as `@meonode/ui`'s `hashStyles` writes them.
//!
//! The runtime hashes the UTF-16 code units of a JavaScript string, each one
//! encoded on its own as one to three bytes: the same bytes as UTF-8 for every
//! character in the Basic Multilingual Plane, and three bytes per surrogate for
//! one outside it. The two must agree, or a name the runtime checks against its
//! text would read as a collision, so this hashes the same bytes.

use sha2::{Digest, Sha256};

/// The prefix every extracted class carries, so it never meets Emotion's `css-`
/// names, a user's class or another library's.
pub const CLASS_PREFIX: &str = "mn-";

/// Digits of the base-36 encoding, as the runtime writes them.
const BASE36_DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

/// Width of the encoding: 2⁶⁴ is below 36¹³, so 13 digits hold any 64-bit value.
const NAME_DIGITS: usize = 13;

/// The bytes `hashStyles` feeds SHA-256 for `text`.
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

/// The 13-digit base-36 hash of `text`, identical to `hashStyles(text)`.
pub fn hash_styles(text: &str) -> String {
    let digest = Sha256::digest(runtime_bytes(text));
    let mut prefix = [0u8; 8];
    prefix.copy_from_slice(&digest[..8]);
    let mut value = u64::from_be_bytes(prefix);
    let mut out = [b'0'; NAME_DIGITS];
    for slot in out.iter_mut().rev() {
        *slot = BASE36_DIGITS[(value % 36) as usize];
        value /= 36;
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
        assert_eq!(hash_styles("a"), "32wshvyj5voay");
        assert_eq!(class_name("a").len(), CLASS_PREFIX.len() + NAME_DIGITS);
    }

    #[test]
    fn every_bit_of_every_character_counts() {
        // Emotion's murmur2 keeps the low byte of each code unit, so these two
        // always collide there.
        assert_ne!(hash_styles("a"), hash_styles("š"));
    }
}
