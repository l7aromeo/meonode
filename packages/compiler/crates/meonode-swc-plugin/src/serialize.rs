//! The serialized styles and class name the runtime gives a styled node,
//! computed at build time.
//!
//! The runtime names a node `${cache.key}-${name}`, where `name` is
//! `hashStyles` of Emotion's `serializeStyles` text for the node's css, after
//! `resolveObjWithTheme`, `dropThemedKeys` and `resolveDefaultStyle`, plus
//! Emotion's label suffix (`nameStyles` in `style-name.util.ts`). For a css
//! object whose values are known, both are pure functions of the object, so
//! the compiler writes them and a compiled node carries the runtime's own
//! identity: Emotion's first insertion, its `cache.inserted` entry and its
//! class name are the uncompiled node's.
//!
//! This module holds the object model and the two steps that read it whole:
//! `resolveDefaultStyle` and Emotion's `createStringFromObject`. Building the
//! object from source, with the token rewrite, is `extract.rs`'s.

use crate::style_name::hash_styles;

/// A css value as the runtime's object holds it, after every rewrite.
#[derive(Debug, Clone, PartialEq)]
pub enum Js {
    Undefined,
    Null,
    Bool(bool),
    Num(f64),
    /// A string, already as `resolveObjWithTheme` leaves it.
    Str(String),
    /// A plain object, in JavaScript's key order.
    Object(Vec<(String, Js)>),
}

impl Js {
    /// JavaScript truthiness.
    fn truthy(&self) -> bool {
        match self {
            Js::Undefined | Js::Null => false,
            Js::Bool(b) => *b,
            Js::Num(n) => *n != 0.0 && !n.is_nan(),
            Js::Str(s) => !s.is_empty(),
            Js::Object(_) => true,
        }
    }

    fn as_str(&self) -> Option<&str> {
        match self {
            Js::Str(s) => Some(s),
            _ => None,
        }
    }
}

/// `obj[key] = value` with JavaScript's ordering: an existing key keeps its
/// place and takes the new value, a new key goes last.
pub fn assign(obj: &mut Vec<(String, Js)>, key: &str, value: Js) {
    match obj.iter_mut().find(|(k, _)| k == key) {
        Some(slot) => slot.1 = value,
        None => obj.push((key.to_string(), value)),
    }
}

fn get<'o>(obj: &'o [(String, Js)], key: &str) -> &'o Js {
    obj.iter()
        .find(|(k, _)| k == key)
        .map_or(&Js::Undefined, |(_, v)| v)
}

/// Whether `key` is a canonical array index, which JavaScript orders before
/// every other key whatever the insertion order. The model keeps insertion
/// order, so such an object is not followed.
pub fn is_index_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 10
        && key.bytes().all(|b| b.is_ascii_digit())
        && (key == "0" || !key.starts_with('0'))
        && key.parse::<u64>().is_ok_and(|n| n < u64::from(u32::MAX))
}

/// `ThemeUtil.resolveDefaultStyle` for a plain object:
/// `{ flex, flexShrink, minHeight: 0, minWidth: 0, ...rest }`, with
/// `flexShrink` computed from the layout the object describes. `flex_shrink_of`
/// is `parseFlexShorthand`'s shrink for a string or number shorthand. `None`
/// where a value it reads would make the runtime throw or is not followed.
pub fn resolve_default_style(
    style: &[(String, Js)],
    flex_shrink_of: impl Fn(&Js) -> Option<Option<f64>>,
) -> Option<Vec<(String, Js)>> {
    let flex = get(style, "flex").clone();
    let rest: Vec<(String, Js)> = style.iter().filter(|(k, _)| k != "flex").cloned().collect();
    let display = get(&rest, "display");
    let is_flex_container = matches!(display.as_str(), Some("flex" | "inline-flex"));
    let has_overflow = get(&rest, "overflow").truthy()
        || get(&rest, "overflowY").truthy()
        || get(&rest, "overflowX").truthy();
    // `flexFlow?.includes('wrap')`: a value with no `includes` throws.
    let wraps_by_flow = match get(&rest, "flexFlow") {
        Js::Undefined | Js::Null => false,
        Js::Str(s) => s.contains("wrap"),
        _ => return None,
    };
    let is_wrapping = wraps_by_flow
        || matches!(
            get(&rest, "flexWrap").as_str(),
            Some("wrap" | "wrap-reverse")
        );
    let has_explicit_flex_shrink = !matches!(get(style, "flexShrink"), Js::Undefined)
        && style.iter().any(|(k, _)| k == "flexShrink");
    let has_flex_shorthand =
        !matches!(flex, Js::Undefined | Js::Null) && flex != Js::Str(String::new());
    let explicit_shrink = if has_flex_shorthand {
        flex_shrink_of(&flex)?
    } else {
        None
    };

    let mut flex_shrink: Option<f64> = None;
    if !has_explicit_flex_shrink {
        if has_flex_shorthand {
            flex_shrink = explicit_shrink;
        } else if is_flex_container {
            if !has_overflow {
                let direction = get(&rest, "flexDirection");
                let column = matches!(direction.as_str(), Some("column" | "column-reverse"));
                let row = matches!(direction.as_str(), Some("row" | "row-reverse"))
                    || !direction.truthy();
                if (column || row) && !is_wrapping {
                    flex_shrink = Some(0.0);
                }
            }
        } else {
            flex_shrink = Some(0.0);
        }
    }

    let mut out = vec![
        ("flex".to_string(), flex),
        (
            "flexShrink".to_string(),
            flex_shrink.map_or(Js::Undefined, Js::Num),
        ),
        ("minHeight".to_string(), Js::Num(0.0)),
        ("minWidth".to_string(), Js::Num(0.0)),
    ];
    for (key, value) in rest {
        assign(&mut out, &key, value);
    }
    Some(out)
}

/// Emotion's `isCustomProperty`: the second character is `-`.
pub fn is_custom_property(key: &str) -> bool {
    key.as_bytes().get(1) == Some(&b'-')
}

/// Emotion's `processStyleName`: kebab case (`ms` at the start gets a dash),
/// a custom property as written.
pub fn process_style_name(key: &str) -> String {
    if is_custom_property(key) {
        return key.to_string();
    }
    let mut out = String::with_capacity(key.len() + 4);
    for (i, ch) in key.char_indices() {
        if ch.is_ascii_uppercase() || (i == 0 && key.starts_with("ms")) {
            out.push('-');
        }
        out.push(ch);
    }
    out.to_lowercase()
}

/// Emotion's `createStringFromObject` for an object holding no registered
/// class names, keyframes or serialized styles. `value_text` is
/// `processStyleValue` for a string or number under its key as written.
/// `None` where the object holds what this port does not follow.
pub fn serialize(
    obj: &[(String, Js)],
    value_text: &impl Fn(&str, &Js) -> Option<String>,
) -> Option<String> {
    let mut out = String::new();
    for (key, value) in obj {
        if is_index_key(key) {
            return None;
        }
        match value {
            Js::Undefined | Js::Bool(_) => {}
            Js::Str(_) | Js::Num(_) => {
                if matches!(key.as_str(), "animation" | "animationName")
                    && value.as_str().is_some_and(|s| s.contains("_EMO_"))
                {
                    return None;
                }
                out.push_str(&process_style_name(key));
                out.push(':');
                out.push_str(&value_text(key, value)?);
                out.push(';');
            }
            // `typeof null` is `'object'`, and an empty interpolation still
            // writes the braces.
            Js::Null => {
                if matches!(key.as_str(), "animation" | "animationName") {
                    return None;
                }
                out.push_str(key);
                out.push_str("{}");
            }
            Js::Object(inner) => {
                if matches!(
                    key.as_str(),
                    "animation" | "animationName" | "NO_COMPONENT_SELECTOR"
                ) || inner.iter().any(|(k, _)| k == "styles" || k == "anim")
                {
                    return None;
                }
                out.push_str(key);
                out.push('{');
                out.push_str(&serialize(inner, value_text)?);
                out.push('}');
            }
        }
    }
    Some(out)
}

/// The name `nameStyles` gives serialized `styles`: `hashStyles` of the text,
/// then Emotion's label suffix, `-<label>` for each
/// `/label:\s*([^\s;{]+)\s*(;|$)/g` match.
pub fn style_name(styles: &str) -> String {
    let mut name = hash_styles(styles);
    for label in labels(styles) {
        name.push('-');
        name.push_str(label);
    }
    name
}

/// JavaScript's `\s`: ECMAScript white space and line terminators.
fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// Each match of Emotion's `labelPattern` over `styles`, in order.
fn labels(styles: &str) -> Vec<&str> {
    let is_space = is_js_space;
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(at) = styles[from..].find("label:") {
        let start = from + at + "label:".len();
        let after_space =
            start + styles[start..].len() - styles[start..].trim_start_matches(is_space).len();
        let value_len = styles[after_space..]
            .find(|c: char| is_space(c) || c == ';' || c == '{')
            .unwrap_or(styles.len() - after_space);
        let value_end = after_space + value_len;
        let tail = styles[value_end..].trim_start_matches(is_space);
        let ends = tail.is_empty() || tail.starts_with(';');
        if value_len > 0 && ends {
            out.push(&styles[after_space..value_end]);
            let consumed = styles.len() - tail.len();
            from = if tail.starts_with(';') {
                consumed + 1
            } else {
                consumed
            };
        } else {
            from = from + at + 1;
        }
        if from >= styles.len() {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(key: &str, v: &Js) -> Option<String> {
        match v {
            Js::Str(s) => Some(s.clone()),
            Js::Num(n)
                if *n != 0.0
                    && !is_custom_property(key)
                    && key != "flexShrink"
                    && key != "opacity" =>
            {
                Some(format!("{n}px"))
            }
            Js::Num(n) => Some(format!("{n}")),
            _ => None,
        }
    }

    fn obj(entries: &[(&str, Js)]) -> Vec<(String, Js)> {
        entries
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    #[test]
    fn serializes_as_create_string_from_object() {
        let css = obj(&[
            ("color", Js::Str("red".into())),
            ("padding", Js::Num(8.0)),
            ("--x", Js::Num(1.0)),
            ("msTransform", Js::Str("none".into())),
            ("hidden", Js::Bool(true)),
            ("gone", Js::Undefined),
            ("empty", Js::Str(String::new())),
            ("nothing", Js::Null),
            (
                "&:hover",
                Js::Object(obj(&[("color", Js::Str("blue".into()))])),
            ),
        ]);
        assert_eq!(
            serialize(&css, &text).as_deref(),
            Some(
                "color:red;padding:8px;--x:1;-ms-transform:none;empty:;nothing{}&:hover{color:blue;}"
            )
        );
    }

    #[test]
    fn leaves_what_it_does_not_follow() {
        assert_eq!(serialize(&obj(&[("0", Js::Str("a".into()))]), &text), None);
        let keyframes = obj(&[("&", Js::Object(obj(&[("anim", Js::Num(1.0))])))]);
        assert_eq!(serialize(&keyframes, &text), None);
        let serialized = obj(&[("&", Js::Object(obj(&[("styles", Js::Str("a".into()))])))]);
        assert_eq!(serialize(&serialized, &text), None);
    }

    #[test]
    fn index_keys_are_canonical_array_indices() {
        for yes in ["0", "1", "42", "4294967294"] {
            assert!(is_index_key(yes), "{yes}");
        }
        for no in ["", "01", "-1", "1.5", "4294967295", "a1", "0%"] {
            assert!(!is_index_key(no), "{no}");
        }
    }

    #[test]
    fn defaults_go_first_and_keep_the_authors_values() {
        let none = |_: &Js| Some(None);
        let out = resolve_default_style(
            &obj(&[("color", Js::Str("red".into())), ("minWidth", Js::Num(4.0))]),
            none,
        )
        .unwrap();
        let keys: Vec<&str> = out.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(
            keys,
            ["flex", "flexShrink", "minHeight", "minWidth", "color"]
        );
        assert_eq!(get(&out, "flexShrink"), &Js::Num(0.0));
        assert_eq!(get(&out, "minWidth"), &Js::Num(4.0));
        let wrapping = obj(&[
            ("display", Js::Str("flex".into())),
            ("flexWrap", Js::Str("wrap".into())),
        ]);
        assert_eq!(
            get(
                &resolve_default_style(&wrapping, none).unwrap(),
                "flexShrink"
            ),
            &Js::Undefined
        );
        let explicit_null = obj(&[("flexShrink", Js::Null)]);
        assert_eq!(
            get(
                &resolve_default_style(&explicit_null, none).unwrap(),
                "flexShrink"
            ),
            &Js::Null
        );
        assert_eq!(
            resolve_default_style(&obj(&[("flexFlow", Js::Num(1.0))]), none),
            None
        );
    }

    #[test]
    fn names_carry_emotions_label_suffix() {
        assert_eq!(style_name("color:red;"), hash_styles("color:red;"));
        assert_eq!(
            style_name("label:card;color:red;"),
            format!("{}-card", hash_styles("label:card;color:red;"))
        );
        assert_eq!(
            style_name("label: a ;label:b"),
            format!("{}-a-b", hash_styles("label: a ;label:b"))
        );
        assert_eq!(style_name("label:a b;"), hash_styles("label:a b;"));
        assert_eq!(style_name("label:{x}"), hash_styles("label:{x}"));
    }
}
