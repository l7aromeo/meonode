//! The fingerprint of a factory's initial props, as the runtime's
//! `initialPropsFingerprint` writes it. A call site whose factory defaults the
//! compiler merged carries it in `__meo$i`, and the runtime skips its own merge
//! only when the text is its factory's own.
//!
//! The encoding needs no escaping, so the same bytes come out of JavaScript and
//! Rust:
//!
//! - a string: `s<len>:<text>`;
//! - a finite number: `n<Number#toString>;`;
//! - `true`, `false`, `null`: `t`, `f`, `z`;
//! - a plain map: `{`, then `k<len>:<key><value>` per entry, then `}`.
//!
//! Lengths are UTF-16 code units, as JavaScript's `.length` counts them. Entries
//! follow JavaScript's own key order (`Object.keys`): integer-like keys first,
//! ascending, then the rest in insertion order. The order is kept, not sorted,
//! because the merged text, and so the style's name, depends on it.

/// A value the fingerprint can write.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Str(String),
    Num(f64),
    Bool(bool),
    Null,
    /// A plain object's entries in insertion order, each key once.
    Map(Vec<(String, Value)>),
}

/// The fingerprint of a factory's initial props, or `None` when a value has no
/// exact text (a number that is not finite), in which case the call is not
/// marked and the runtime merges as it always has.
pub fn fingerprint(initial: &[(String, Value)]) -> Option<String> {
    let mut out = String::new();
    write_map(initial, &mut out)?;
    Some(out)
}

fn write_map(entries: &[(String, Value)], out: &mut String) -> Option<()> {
    out.push('{');
    let mut ordered: Vec<&(String, Value)> = entries.iter().collect();
    // A stable sort keeps the insertion order among the keys that are not integer-like.
    ordered.sort_by_key(|(key, _)| array_index(key).map_or((1, 0), |index| (0, index)));
    for (key, value) in ordered {
        out.push('k');
        out.push_str(&utf16_len(key).to_string());
        out.push(':');
        out.push_str(key);
        write_value(value, out)?;
    }
    out.push('}');
    Some(())
}

fn write_value(value: &Value, out: &mut String) -> Option<()> {
    match value {
        Value::Str(text) => {
            out.push('s');
            out.push_str(&utf16_len(text).to_string());
            out.push(':');
            out.push_str(text);
        }
        Value::Num(n) => {
            out.push('n');
            out.push_str(&js_number_to_string(*n)?);
            out.push(';');
        }
        Value::Bool(true) => out.push('t'),
        Value::Bool(false) => out.push('f'),
        Value::Null => out.push('z'),
        Value::Map(entries) => write_map(entries, out)?,
    }
    Some(())
}

/// The length JavaScript gives a string: UTF-16 code units.
fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// The largest array index, `2^32 - 2`. A key that reads as an integer up to it,
/// written without a sign or a leading zero, is integer-like: JavaScript lists
/// such keys first, in numeric order.
const MAX_ARRAY_INDEX: u64 = 4_294_967_294;

/// Whether JavaScript treats `key` as an array index, listing it ahead of the
/// other keys of an object.
pub fn is_array_index(key: &str) -> bool {
    array_index(key).is_some()
}

/// The key's array index, when JavaScript treats the key as one.
fn array_index(key: &str) -> Option<u64> {
    if key.is_empty()
        || (key.len() > 1 && key.starts_with('0'))
        || !key.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    key.parse::<u64>()
        .ok()
        .filter(|index| *index <= MAX_ARRAY_INDEX)
}

/// Past this decimal exponent, and below the negative one, `Number#toString`
/// writes a number in exponent form.
const PLAIN_EXPONENT_MAX: i32 = 21;
const PLAIN_EXPONENT_MIN: i32 = -6;

/// `Number#toString` for any finite number, by ECMAScript's Number::toString:
/// the shortest digits that read back as the same number, placed by its
/// exponent. `None` for NaN and the infinities.
pub fn js_number_to_string(n: f64) -> Option<String> {
    if !n.is_finite() {
        return None;
    }
    // Both zeros are written "0".
    if n == 0.0 {
        return Some("0".into());
    }
    if n < 0.0 {
        return js_number_to_string(-n).map(|text| format!("-{text}"));
    }
    // Rust's `{:e}` writes the shortest round-trip digits as `d.ddde<exp>`.
    let scientific = format!("{n:e}");
    let (mantissa, exponent) = scientific.split_once('e')?;
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    // The decimal point sits after `point` digits.
    let point = exponent.parse::<i32>().ok()? + 1;
    Some(if k <= point && point <= PLAIN_EXPONENT_MAX {
        format!("{digits}{}", "0".repeat((point - k) as usize))
    } else if 0 < point && point <= PLAIN_EXPONENT_MAX {
        format!(
            "{}.{}",
            &digits[..point as usize],
            &digits[point as usize..]
        )
    } else if PLAIN_EXPONENT_MIN < point && point <= 0 {
        format!("0.{}{digits}", "0".repeat((-point) as usize))
    } else {
        let sign = if point - 1 < 0 { '-' } else { '+' };
        let rest = if k > 1 {
            format!(".{}", &digits[1..])
        } else {
            String::new()
        };
        format!("{}{rest}e{sign}{}", &digits[..1], (point - 1).abs())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(text: &str) -> Value {
        Value::Str(text.into())
    }

    fn map(entries: &[(&str, Value)]) -> Vec<(String, Value)> {
        entries
            .iter()
            .map(|(key, value)| (key.to_string(), value.clone()))
            .collect()
    }

    // The texts the runtime's own test pins (packages/ui tests/static-css/layout-factory.test.ts).
    #[test]
    fn writes_the_runtimes_texts() {
        assert_eq!(
            fingerprint(&map(&[("display", s("flex")), ("flexDirection", s("row"))])).as_deref(),
            Some("{k7:displays4:flexk13:flexDirections3:row}")
        );
        assert_eq!(
            fingerprint(&map(&[
                ("display", s("flex")),
                ("flexDirection", s("column")),
                ("alignItems", s("center")),
                ("justifyContent", s("center")),
            ]))
            .as_deref(),
            Some(
                "{k7:displays4:flexk13:flexDirections6:columnk10:alignItemss6:centerk14:justifyContents6:center}"
            )
        );
        assert_eq!(
            fingerprint(&map(&[("content", s("😀→"))])).as_deref(),
            Some("{k7:contents3:😀→}")
        );
        assert_eq!(fingerprint(&[]).as_deref(), Some("{}"));
        assert_eq!(
            fingerprint(&map(&[("b", Value::Num(1.0)), ("2", s("x"))])).as_deref(),
            Some("{k1:2s1:xk1:bn1;}")
        );
        assert_eq!(
            fingerprint(&map(&[
                ("flexGrow", Value::Num(1.0)),
                ("opacity", Value::Num(0.5)),
                ("zIndex", Value::Num(-2.0)),
                ("lineHeight", Value::Num(1e21)),
            ]))
            .as_deref(),
            Some("{k8:flexGrown1;k7:opacityn0.5;k6:zIndexn-2;k10:lineHeightn1e+21;}")
        );
        assert_eq!(
            fingerprint(&map(&[
                (
                    "css",
                    Value::Map(map(&[
                        ("&:hover", Value::Map(map(&[("color", s("red"))]))),
                        ("--x", s("a;b"))
                    ])),
                ),
                ("hidden", Value::Bool(true)),
                ("wrap", Value::Bool(false)),
                ("title", Value::Null),
            ]))
            .as_deref(),
            Some("{k3:css{k7:&:hover{k5:colors3:red}k3:--xs3:a;b}k6:hiddentk4:wrapfk5:titlez}")
        );
        assert_eq!(
            fingerprint(&map(&[
                ("padding", Value::Num(4.0)),
                (
                    "css",
                    Value::Map(map(&[("&:hover", Value::Map(map(&[("color", s("red"))])))]))
                ),
            ]))
            .as_deref(),
            Some("{k7:paddingn4;k3:css{k7:&:hover{k5:colors3:red}}}")
        );
    }

    #[test]
    fn keeps_the_written_order() {
        let one = fingerprint(&map(&[("color", s("red")), ("padding", Value::Num(4.0))]));
        let other = fingerprint(&map(&[("padding", Value::Num(4.0)), ("color", s("red"))]));
        assert_ne!(one, other);
    }

    #[test]
    fn lists_integer_like_keys_first_in_numeric_order() {
        let text = fingerprint(&map(&[
            ("b", s("")),
            ("10", s("")),
            ("2", s("")),
            ("01", s("")),
            ("4294967295", s("")),
            ("4294967294", s("")),
            ("-1", s("")),
            ("a", s("")),
        ]));
        // "01", "-1" and 2^32 - 1 are not array indexes, so they keep their place.
        assert_eq!(
            text.as_deref(),
            Some(
                "{k1:2s0:k2:10s0:k10:4294967294s0:k1:bs0:k2:01s0:k10:4294967295s0:k2:-1s0:k1:as0:}"
            )
        );
    }

    #[test]
    fn tells_apart_entries_whose_texts_run_together() {
        let pairs = [
            (map(&[("ab", s("c"))]), map(&[("a", s("bc"))])),
            (
                map(&[("a", s("s1:b"))]),
                map(&[("a", s("s")), ("1:b", s(""))]),
            ),
            (map(&[("a", s("1"))]), map(&[("a", Value::Num(1.0))])),
            (map(&[("a", Value::Null)]), map(&[("a", s("z"))])),
            (
                map(&[("a", Value::Map(map(&[("b", s("c"))])))]),
                map(&[("a", s("{k1:bs1:c}"))]),
            ),
        ];
        for (one, other) in pairs {
            assert_ne!(fingerprint(&one), fingerprint(&other));
        }
    }

    #[test]
    fn has_none_for_a_number_that_is_not_finite() {
        assert_eq!(
            fingerprint(&map(&[("opacity", Value::Num(f64::NAN))])),
            None
        );
        assert_eq!(
            fingerprint(&map(&[("opacity", Value::Num(f64::INFINITY))])),
            None
        );
        assert_eq!(
            fingerprint(&map(&[(
                "css",
                Value::Map(map(&[("opacity", Value::Num(f64::NEG_INFINITY))]))
            )])),
            None
        );
    }

    // The table's text is what the compiler writes in `__meo$i`, so it must be the
    // fingerprint of the props it merges.
    #[test]
    fn layout_factories_carry_their_own_fingerprint() {
        use crate::extract_tables::{InitialValue, LAYOUT_FACTORIES};
        for (name, text, initial) in LAYOUT_FACTORIES {
            let entries: Vec<(String, Value)> = initial
                .iter()
                .map(|(key, value)| {
                    let value = match value {
                        InitialValue::Str(text) => Value::Str(text.to_string()),
                        InitialValue::Num(n) => Value::Num(*n),
                    };
                    (key.to_string(), value)
                })
                .collect();
            assert_eq!(fingerprint(&entries).as_deref(), Some(*text), "{name}");
        }
    }

    // Each against what Node prints for `String(n)`.
    #[test]
    fn writes_numbers_as_javascript_does() {
        let cases: &[(f64, &str)] = &[
            (0.0, "0"),
            (-0.0, "0"),
            (1.0, "1"),
            (-2.0, "-2"),
            (0.5, "0.5"),
            (16.0, "16"),
            (1.5, "1.5"),
            (0.1 + 0.2, "0.30000000000000004"),
            (123456789012345680000.0, "123456789012345680000"),
            (1e21, "1e+21"),
            (1.5e21, "1.5e+21"),
            (1e-6, "0.000001"),
            (1.5e-6, "0.0000015"),
            (1e-7, "1e-7"),
            (1.25e-7, "1.25e-7"),
            (5e-324, "5e-324"),
            (f64::MAX, "1.7976931348623157e+308"),
            (100.0, "100"),
            (0.001, "0.001"),
            (12.345, "12.345"),
        ];
        for (n, want) in cases {
            assert_eq!(js_number_to_string(*n).as_deref(), Some(*want), "{n}");
        }
        assert_eq!(js_number_to_string(f64::NAN), None);
    }
}
