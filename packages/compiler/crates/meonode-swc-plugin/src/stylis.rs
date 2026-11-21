//! What Emotion's stylis pipeline does to one declaration, ported so extracted
//! rules hold exactly the declarations Emotion would write.
//!
//! Two steps, in the order stylis runs them:
//! - [`minify_value`]: stylis's parser drops and collapses whitespace in a value.
//! - [`prefix`]: Emotion's vendor prefixer (`@meonode/ui`'s copy,
//!   `src/util/emotion-prefixer.util.ts`, itself `@emotion/cache` 11.14.0's)
//!   adds vendor-prefixed declarations, chosen by stylis's [`hash`] of the
//!   property.
//!
//! `tests/fixture/extract/prefixer.json` holds the real pipeline's output for
//! every CSS property against sample values, written by
//! `scripts/codegen-extract-tables.ts`; the tests below compare against it.

use regex_lite::Regex;
use std::sync::LazyLock;

const WEBKIT: &str = "-webkit-";
const MOZ: &str = "-moz-";
const MS: &str = "-ms-";

/// `charCodeAt(index) | 0` over UTF-16 code units: 0 past the end.
fn charat(value: &[u16], index: usize) -> u32 {
    value.get(index).map_or(0, |&unit| u32::from(unit))
}

/// stylis's `hash(value, length)`: the property's length and first four
/// characters, or 0 for a declaration starting with `-` (a custom or
/// vendor-prefixed property).
pub fn hash(value: &str, length: usize) -> i64 {
    let units: Vec<u16> = value.encode_utf16().collect();
    if charat(&units, 0) == 45 {
        return 0;
    }
    // JavaScript's bitwise operators work on 32-bit integers.
    let mut h = (length as i32) << 2;
    h ^= charat(&units, 0) as i32;
    h <<= 2;
    h ^= charat(&units, 1) as i32;
    h <<= 2;
    h ^= charat(&units, 2) as i32;
    h <<= 2;
    h ^= charat(&units, 3) as i32;
    i64::from(h)
}

/// stylis's `token`: what kind of character `code` is for whitespace handling.
fn token(code: u32) -> u8 {
    match code {
        0 | 9 | 10 | 13 | 32 => 5,
        33 | 43 | 44 | 47 | 62 | 64 | 126 | 59 | 123 | 125 => 4,
        58 => 3,
        34 | 39 | 40 | 91 => 2,
        41 | 93 => 1,
        _ => 0,
    }
}

/// The value as stylis writes it, or `None` for a value whose parse this port
/// does not follow, which then stays on the runtime path: a backslash, a
/// newline or another control character, a `;`, `{`, `}`, `&`, `@` or `:`
/// outside parentheses and quotes, a comment, or unbalanced delimiters.
///
/// Whitespace outside parentheses and quotes goes when the character before it
/// is `:` or one of `!+,/>@~;{}`, or the one after it is one of those
/// (other than `:`), or the value ends; otherwise a run becomes one space.
/// Parenthesised and quoted text is copied as it is.
pub fn minify_value(value: &str) -> Option<String> {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    // The value follows the property's `:`.
    let mut previous: u32 = 58;
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        let code = ch as u32;
        match ch {
            ' ' | '\t' => {
                while i < chars.len() && (chars[i] as u32) < 33 {
                    if chars[i] != ' ' && chars[i] != '\t' {
                        return None;
                    }
                    i += 1;
                }
                let next = chars.get(i).map_or(0, |&c| c as u32);
                if !(token(previous) > 2 || token(next) > 3) {
                    out.push(' ');
                }
                continue;
            }
            '(' | '"' | '\'' | '[' => {
                let end = delimited_end(&chars, i)?;
                out.extend(&chars[i..=end]);
                previous = chars[end] as u32;
                i = end + 1;
                continue;
            }
            '/' if matches!(chars.get(i + 1), Some('*' | '/')) => return None,
            ';' | '{' | '}' | '&' | '@' | ':' | '\\' | ')' | ']' => return None,
            _ if code < 33 => return None,
            _ => out.push(ch),
        }
        previous = code;
        i += 1;
    }
    Some(out)
}

/// The index of the character closing the group opened at `start`, following
/// stylis's `delimiter`: quotes nest inside parentheses and brackets, and
/// parentheses inside parentheses. `None` when it never closes, or on a
/// backslash or a control character, which this port leaves to the runtime.
fn delimited_end(chars: &[char], start: usize) -> Option<usize> {
    let close = match chars[start] {
        '(' => ')',
        '[' => ']',
        quote => quote,
    };
    let mut i = start + 1;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '\\' || (ch as u32) < 32 {
            return None;
        }
        if ch == close {
            return Some(i);
        }
        let nested_quote = (ch == '"' || ch == '\'') && close != '"' && close != '\'';
        if nested_quote || (ch == '(' && close == ')') {
            i = delimited_end(chars, i)?;
        }
        i += 1;
    }
    None
}

macro_rules! re {
    ($name:ident, $pattern:expr) => {
        static $name: LazyLock<Regex> =
            LazyLock::new(|| Regex::new($pattern).expect("valid pattern"));
    };
}

re!(BOX_ALIGN, r"(\w+).+(:[\s\S]+)");
re!(FLEX_OR_SELF, r"flex-|-self");
re!(ALIGN_CONTENT, r"align-content|flex-|-self");
re!(TRANSFORM, r"([^-])(transform)");
re!(ZOOM_OR_GRAB, r"(zoom-|grab)");
re!(IMAGE_SET, r"(image-set)");
re!(IMAGE_SET_CALL, r"(image-set\([\s\S]*)");
re!(JUSTIFY, r"(.+:)(flex-)?(.*)");
re!(SPACE_BETWEEN, r"s.+-b[^;]+");
re!(INLINE, r"(.+)-inline(.+)");
re!(SIZE_KEYWORD, r"(.+:)(.+)-([\s\S]+)");
re!(DISPLAY, r"(.+:)([^;!]+)(;|!.+)?");
re!(WRITING_MODE, r"[svh]\w+-[tblr]{2}");

/// JavaScript's `value.replace(regex, replacement)` without the `g` flag: the
/// first match only, with `$n` read from the replacement.
fn replace_first(value: &str, re: &Regex, replacement: &str) -> String {
    re.replacen(value, 1, replacement).into_owned()
}

/// JavaScript's `value.replace('search', 'with')`: the first occurrence only.
fn replace_str(value: &str, search: &str, with: &str) -> String {
    value.replacen(search, with, 1)
}

/// Emotion's `prefix(value, length)`: `value` is one declaration as stylis
/// holds it, `property:value;`, and `length` the property's length. Returns the
/// declarations to write, `value` itself when nothing is prefixed.
pub fn prefix(value: &str, length: usize) -> String {
    let units: Vec<u16> = value.encode_utf16().collect();
    let at = |index: usize| charat(&units, index);
    match hash(value, length) {
        5103 => format!("{WEBKIT}print-{value}{value}"),
        5737 | 4201 | 3177 | 3433 | 1641 | 4457 | 2921 | 5572 | 6356 | 5844 | 3191 | 6645
        | 3005 | 6391 | 5879 | 5623 | 6135 | 4599 | 4855 | 4215 | 6389 | 5109 | 5365 | 5621
        | 3829 => format!("{WEBKIT}{value}{value}"),
        5349 | 4246 | 4810 | 6968 | 2756 => {
            format!("{WEBKIT}{value}{MOZ}{value}{MS}{value}{value}")
        }
        6828 | 4268 => format!("{WEBKIT}{value}{MS}{value}{value}"),
        6165 => format!("{WEBKIT}{value}{MS}flex-{value}{value}"),
        5187 => format!(
            "{WEBKIT}{value}{}{value}",
            replace_first(
                value,
                &BOX_ALIGN,
                &format!("{WEBKIT}box-${{1}}${{2}}{MS}flex-${{1}}${{2}}")
            )
        ),
        5443 => format!(
            "{WEBKIT}{value}{MS}flex-item-{}{value}",
            replace_first(value, &FLEX_OR_SELF, "")
        ),
        4675 => format!(
            "{WEBKIT}{value}{MS}flex-line-pack{}{value}",
            replace_first(value, &ALIGN_CONTENT, "")
        ),
        5548 => format!(
            "{WEBKIT}{value}{MS}{}{value}",
            replace_str(value, "shrink", "negative")
        ),
        5292 => format!(
            "{WEBKIT}{value}{MS}{}{value}",
            replace_str(value, "basis", "preferred-size")
        ),
        6060 => format!(
            "{WEBKIT}box-{}{WEBKIT}{value}{MS}{}{value}",
            replace_str(value, "-grow", ""),
            replace_str(value, "grow", "positive")
        ),
        4554 => format!(
            "{WEBKIT}{}{value}",
            TRANSFORM.replace_all(value, format!("${{1}}{WEBKIT}${{2}}").as_str())
        ),
        6187 => {
            let replaced = replace_first(
                &replace_first(value, &ZOOM_OR_GRAB, &format!("{WEBKIT}${{1}}")),
                &IMAGE_SET,
                &format!("{WEBKIT}${{1}}"),
            );
            format!("{}{value}", replace_str(&replaced, value, ""))
        }
        5495 | 3959 => match IMAGE_SET_CALL.find(value) {
            // `$1` then `` $` ``, the text before the match, then `$1` again.
            Some(m) => {
                let before = &value[..m.start()];
                format!(
                    "{before}{WEBKIT}{}{before}{}{}",
                    m.as_str(),
                    m.as_str(),
                    &value[m.end()..]
                )
            }
            None => value.to_string(),
        },
        4968 => format!(
            "{}{WEBKIT}{value}{value}",
            replace_first(
                &replace_first(
                    value,
                    &JUSTIFY,
                    &format!("{WEBKIT}box-pack:${{3}}{MS}flex-pack:${{3}}")
                ),
                &SPACE_BETWEEN,
                "justify"
            )
        ),
        4095 | 3583 | 4068 | 2532 => format!(
            "{}{value}",
            replace_first(value, &INLINE, &format!("{WEBKIT}${{1}}${{2}}"))
        ),
        8116 | 7059 | 5753 | 5535 | 5445 | 5701 | 4933 | 4677 | 5533 | 5789 | 5021 | 4765 => {
            if units.len() as i64 - 1 - length as i64 > 6 {
                let first = at(length + 1);
                if first == 102 || (first == 109 && at(length + 4) == 45) {
                    let tail = if at(length + 3) == 108 {
                        "${3}"
                    } else {
                        "${2}-${3}"
                    };
                    return format!(
                        "{}{value}",
                        replace_first(
                            value,
                            &SIZE_KEYWORD,
                            &format!("${{1}}{WEBKIT}${{2}}-${{3}}${{1}}{MOZ}{tail}")
                        )
                    );
                }
                if first == 115 {
                    return if value.contains("stretch") {
                        format!(
                            "{}{value}",
                            prefix(&replace_str(value, "stretch", "fill-available"), length)
                        )
                    } else {
                        value.to_string()
                    };
                }
            }
            value.to_string()
        }
        4949 | 6444 => {
            if hash(value, length) == 4949 && at(length + 1) != 115 {
                return value.to_string();
            }
            let important = if value.contains("!important") { 10 } else { 0 };
            let index = (units.len() as i64 - 3 - important).max(0) as usize;
            match at(index) {
                107 => format!("{}{value}", replace_str(value, ":", &format!(":{WEBKIT}"))),
                101 => {
                    let inline = if at(14) == 45 { "inline-" } else { "" };
                    format!(
                        "{}{value}",
                        replace_first(
                            value,
                            &DISPLAY,
                            &format!(
                                "${{1}}{WEBKIT}{inline}box${{3}}${{1}}{WEBKIT}${{2}}${{3}}${{1}}{MS}${{2}}box${{3}}"
                            )
                        )
                    )
                }
                _ => value.to_string(),
            }
        }
        5936 => match at(length + 11) {
            114 => format!(
                "{WEBKIT}{value}{MS}{}{value}",
                replace_first(value, &WRITING_MODE, "tb")
            ),
            108 => format!(
                "{WEBKIT}{value}{MS}{}{value}",
                replace_first(value, &WRITING_MODE, "tb-rl")
            ),
            45 => format!(
                "{WEBKIT}{value}{MS}{}{value}",
                replace_first(value, &WRITING_MODE, "lr")
            ),
            _ => format!("{WEBKIT}{value}{MS}{value}{value}"),
        },
        _ => value.to_string(),
    }
}

/// Every `hash` the prefixer switches on.
const PREFIXED_HASHES: &[i64] = &[
    5103, 5737, 4201, 3177, 3433, 1641, 4457, 2921, 5572, 6356, 5844, 3191, 6645, 3005, 6391, 5879,
    5623, 6135, 4599, 4855, 4215, 6389, 5109, 5365, 5621, 3829, 5349, 4246, 4810, 6968, 2756, 6828,
    4268, 6165, 5187, 5443, 4675, 5548, 5292, 6060, 4554, 6187, 5495, 3959, 4968, 4095, 3583, 4068,
    2532, 8116, 7059, 5753, 5535, 5445, 5701, 4933, 4677, 5533, 5789, 5021, 4765, 4949, 6444, 5936,
];

/// The sizing properties (`width`, `min-height`, `inline-size`, …), which the
/// prefixer rewrites only for the keywords `fit-content`, `max-content`,
/// `min-content` and `stretch`, adding `-webkit-` and `-moz-` forms that no
/// browser the parity suite runs needs.
const SIZING_HASHES: &[i64] = &[
    8116, 7059, 5753, 5535, 5445, 5701, 4933, 4677, 5533, 5789, 5021, 4765,
];

/// Whether the prefixer may rewrite a declaration of `property`, so a value
/// only known at runtime cannot be written as a variable here. The sizing
/// properties are the exception: their prefixed forms are for browsers older
/// than any the output is checked in.
pub fn is_prefixed_property(property: &str) -> bool {
    let h = hash(&format!("{property}:"), property.len());
    PREFIXED_HASHES.contains(&h) && !SIZING_HASHES.contains(&h)
}

/// The declarations Emotion writes for `property: value`, `property` already
/// in its written (kebab-case) form, or `None` when [`minify_value`] leaves the
/// value to the runtime.
pub fn declarations(property: &str, value: &str) -> Option<String> {
    let minified = minify_value(value)?;
    let declaration = format!("{property}:{minified};");
    Some(prefix(&declaration, property.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The real pipeline's output, written by `scripts/codegen-extract-tables.ts`.
    const PREFIXER_CASES: &str = include_str!("../tests/fixture/extract/prefixer.json");

    #[test]
    fn matches_emotion_on_every_property_and_sample_value() {
        let cases: Vec<(String, usize, String)> =
            serde_json::from_str(PREFIXER_CASES).expect("fixture parses");
        // Every CSS property @meonode/ui knows has at least one case.
        let properties: std::collections::HashSet<&str> =
            cases.iter().map(|(d, length, _)| &d[..*length]).collect();
        assert!(properties.len() > 600, "{} properties", properties.len());
        let mut mismatches = Vec::new();
        for (declaration, length, expected) in &cases {
            let (property, value) = declaration.split_at(*length);
            let value = value.trim_start_matches(':').trim_end_matches(';');
            let expected = expected
                .strip_prefix(".x{")
                .and_then(|s| s.strip_suffix('}'))
                .expect("one rule");
            match declarations(property, value) {
                Some(got) if got == expected => {}
                got => mismatches.push(format!("{declaration} -> {got:?}, Emotion {expected:?}")),
            }
        }
        assert!(
            mismatches.is_empty(),
            "{} mismatches:\n{}",
            mismatches.len(),
            mismatches
                .iter()
                .take(40)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );
    }

    #[test]
    fn hash_is_zero_for_custom_and_vendor_properties() {
        assert_eq!(hash("--x:1;", 3), 0);
        assert_eq!(hash("-webkit-mask:none;", 12), 0);
    }

    #[test]
    fn minify_follows_stylis() {
        assert_eq!(
            minify_value("red !important").as_deref(),
            Some("red!important")
        );
        assert_eq!(
            minify_value("opacity 1s, transform 2s").as_deref(),
            Some("opacity 1s,transform 2s")
        );
        assert_eq!(
            minify_value("  1px   solid   red  ").as_deref(),
            Some("1px solid red")
        );
        assert_eq!(
            minify_value("calc(100% - 8px)").as_deref(),
            Some("calc(100% - 8px)")
        );
        assert_eq!(minify_value("\"a  b\"").as_deref(), Some("\"a  b\""));
    }

    #[test]
    fn minify_leaves_what_it_cannot_follow_to_the_runtime() {
        for value in [
            "a;b", "a{b", "a}b", "a:b", "a\nb", "a/*x*/", "a//b", "a\\b", "url(a", "&", "@x",
        ] {
            assert_eq!(minify_value(value), None, "{value:?}");
        }
    }
}
