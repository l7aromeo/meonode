//! How Emotion turns a nested key into the selectors of its rule, ported so
//! extracted rules match the elements Emotion's rules match.
//!
//! Three steps, in the order Emotion runs them:
//! - stylis's parser (`parse` and `ruleset` in stylis 4.2's `Parser.js`, with
//!   the tokenizer's `whitespace`, `delimit` and `escaping`) composes the key
//!   with its parent's selectors: `&` is replaced, a list item without one is a
//!   descendant, whitespace is collapsed and dropped around combinators.
//! - Emotion's `compat` plugin (`@emotion/cache` 11.14.0) composes some rules
//!   again from their parent's final selectors: a key starting with a colon is
//!   attached to its parent (`:hover` is `&:hover`), as are list items starting
//!   with one, and so are lists and the children of rules it composed again.
//! - Emotion's prefixer writes copies of `::placeholder` and
//!   `:read-only`/`:read-write` rules with vendor selectors ([`prefixed`]).
//!
//! Selectors hold [`NODE`] where the node's class goes. Positions and lengths
//! are counted in UTF-16 code units, as stylis counts them.

/// Stands for the node's class in a selector. A private-use character, so no
/// stylis rule treats it as whitespace or punctuation; a key holding one is not
/// followed ([`Rule::nest`]).
pub const NODE: char = '\u{E000}';

/// `&` as stylis marks it for replacement: followed by a form feed.
const AMPERSAND_MARK: [u16; 2] = [b'&' as u16, 0x0C];

/// A rule's selectors and the state its nested rules compose from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    /// The selectors as stylis's parser composed them; nested keys compose
    /// with these.
    parsed: Vec<String>,
    /// The selectors as written, after Emotion's `compat`.
    pub props: Vec<String>,
    /// stylis's `length`: one past the last colon in the key, outside
    /// delimiters, or the parent's when the key has none. Emotion's `compat`
    /// and prefixer skip a rule whose `length` is 0.
    pub length: i32,
    /// Whether `compat` composed this rule again, so its nested rules are too.
    fixed: bool,
}

impl Rule {
    /// The node's own rule: its class alone.
    pub fn node() -> Self {
        Rule {
            parsed: vec![NODE.to_string()],
            props: vec![NODE.to_string()],
            length: 0,
            fixed: false,
        }
    }

    /// The rule of selector `key` nested in this one, or `None` for a key whose
    /// parse this port does not follow because Emotion's would not stay inside
    /// the rule: a `{`, `}`, `;`, NUL or `@` outside delimiters, a `//` comment,
    /// an unterminated comment, quote or bracket, a key starting with `--`, or
    /// a key holding [`NODE`].
    pub fn nest(&self, key: &str) -> Option<Rule> {
        let parsed = parse_key(key, self.length)?;
        let parsed_props = ruleset(&parsed.characters, &parsed.points, &self.parsed);
        let mut rule = Rule {
            parsed: parsed_props.clone(),
            props: parsed_props,
            length: parsed.length,
            fixed: false,
        };
        rule.compat(&parsed.characters, self);
        Some(rule)
    }

    /// The scope inside at-rule `key` nested in this rule: the at-rule's text
    /// as stylis writes it, and the rule its contents compose with (this one,
    /// with the at-rule's `length`). `None` as for [`Rule::nest`].
    pub fn at_rule(&self, key: &str) -> Option<(String, Rule)> {
        let parsed = parse_key(key, self.length)?;
        let text = String::from_utf16(&parsed.characters).ok()?;
        let scope = Rule {
            length: parsed.length,
            ..self.clone()
        };
        Some((text, scope))
    }

    /// Emotion's `compat`: composes the rule again from `parent`'s final
    /// selectors when it starts with a colon, is a list, or `parent` was.
    fn compat(&mut self, value: &[u16], parent: &Rule) {
        if self.length < 1 {
            return;
        }
        if self.props.len() == 1 && value.first() != Some(&(b':' as u16)) && !parent.fixed {
            return;
        }
        self.fixed = true;
        let (rules, points) = compat_rules(value);
        let mut k = 0;
        for (i, rule) in rules.iter().enumerate() {
            for parent_rule in &parent.props {
                let composed = if points[i] {
                    js_replace_all(rule, &AMPERSAND_MARK, &to_utf16(parent_rule))
                } else {
                    let mut out = to_utf16(parent_rule);
                    out.push(b' ' as u16);
                    out.extend_from_slice(rule);
                    out
                };
                let composed = String::from_utf16_lossy(&composed);
                if k < self.props.len() {
                    self.props[k] = composed;
                } else {
                    self.props.push(composed);
                }
                k += 1;
            }
        }
    }
}

/// The copies Emotion's prefixer writes before a rule with selectors `props`
/// and stylis `length`: each a single selector, for each selector naming
/// `::placeholder`, `:read-only` or `:read-write`.
pub fn prefixed(props: &[String], length: i32) -> Vec<String> {
    let mut out = Vec::new();
    if length == 0 {
        return out;
    }
    for value in props {
        match first_prefixed_pseudo(value) {
            Some(":read-only") | Some(":read-write") => {
                out.push(replace_first_after_colon(value, "read-", ":-moz-"));
            }
            Some("::placeholder") => {
                out.push(replace_first_after_colon(value, "plac", ":-webkit-input-"));
                out.push(replace_first_after_colon(value, "plac", ":-moz-"));
                out.push(replace_first_after_colon(value, "plac", "-ms-input-"));
            }
            _ => {}
        }
    }
    out
}

/// The first match of `/(::plac\w+|:read-\w+)/` in `value`.
fn first_prefixed_pseudo(value: &str) -> Option<&str> {
    let bytes = value.as_bytes();
    let word_end = |from: usize| {
        let mut end = from;
        while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_') {
            end += 1;
        }
        end
    };
    for start in (0..bytes.len()).filter(|&i| bytes[i] == b':') {
        for prefix in ["::plac", ":read-"] {
            if value[start..].starts_with(prefix) {
                let end = word_end(start + prefix.len());
                if end > start + prefix.len() {
                    return Some(&value[start..end]);
                }
            }
        }
    }
    None
}

/// `value.replace(/:(<word>\w+)/, replacement + '$1')`: the first colon
/// followed by `word` and more word characters loses the colon to
/// `replacement`.
fn replace_first_after_colon(value: &str, word: &str, replacement: &str) -> String {
    let bytes = value.as_bytes();
    for start in 0..bytes.len() {
        if bytes[start] == b':' && value[start + 1..].starts_with(word) {
            let mut end = start + 1 + word.len();
            if end >= bytes.len() || !(bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_') {
                continue;
            }
            while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_') {
                end += 1;
            }
            return format!(
                "{}{}{}{}",
                &value[..start],
                replacement,
                &value[start + 1..end],
                &value[end..]
            );
        }
    }
    value.to_string()
}

/// A key as stylis's parser leaves it at its `{`.
struct ParsedKey {
    /// The key's characters, `&` marked with a form feed, whitespace collapsed.
    characters: Vec<u16>,
    /// Per list item, its end in `characters`: negative when the item names
    /// `&` (replaced), positive when it does not (a descendant).
    points: Vec<i64>,
    /// stylis's `length` at the `{`.
    length: i32,
}

/// stylis's tokenizer over one string.
struct Tokenizer<'a> {
    chars: &'a [u16],
    position: usize,
    character: u16,
}

impl<'a> Tokenizer<'a> {
    fn new(chars: &'a [u16]) -> Self {
        Tokenizer {
            chars,
            position: 0,
            character: 0,
        }
    }

    fn next(&mut self) -> u16 {
        self.character = if self.position < self.chars.len() {
            self.position += 1;
            self.chars[self.position - 1]
        } else {
            0
        };
        self.character
    }

    fn peek(&self) -> u16 {
        self.chars.get(self.position).copied().unwrap_or(0)
    }

    fn slice(&self, begin: usize, end: usize) -> &'a [u16] {
        let end = end.min(self.chars.len());
        if begin >= end {
            &[]
        } else {
            &self.chars[begin..end]
        }
    }

    /// `delimiter(type)`: the position just past the delimiter closing `kind`.
    fn delimiter(&mut self, kind: u16) -> usize {
        while self.next() != 0 {
            match self.character {
                c if c == kind => return self.position,
                34 | 39 => {
                    if kind != 34 && kind != 39 {
                        self.delimiter(self.character);
                    }
                }
                40 => {
                    if kind == 41 {
                        self.delimiter(kind);
                    }
                }
                92 => {
                    self.next();
                }
                _ => {}
            }
        }
        self.position
    }

    /// `delimit(type)`: the delimited run from its opening character, trimmed.
    /// `None` when it is never closed.
    fn delimit(&mut self, kind: u16) -> Option<Vec<u16>> {
        let begin = self.position - 1;
        let closing = match kind {
            91 => 93,
            40 => 41,
            other => other,
        };
        let end = self.delimiter(closing);
        let run = self.slice(begin, end);
        if run.last() != Some(&closing) || run.len() < 2 {
            return None;
        }
        Some(js_trim(run).to_vec())
    }

    /// `whitespace(type)`: skips whitespace; a space unless `previous` or the
    /// next character makes it insignificant.
    fn whitespace(&mut self, previous: u16) -> &'static [u16] {
        loop {
            let character = self.peek();
            self.character = character;
            if character != 0 && character < 33 {
                self.next();
            } else {
                break;
            }
        }
        if token(previous) > 2 || token(self.character) > 3 {
            &[]
        } else {
            &[32]
        }
    }

    /// `escaping(index, count)`: a backslash escape from `index`.
    fn escaping(&mut self, index: usize, mut count: u32) -> &'a [u16] {
        loop {
            count -= 1;
            if count == 0 || self.next() == 0 {
                break;
            }
            let c = self.character;
            if !(c.is_ascii_hexdigit_u16()) {
                break;
            }
        }
        // stylis reads the caret before `next()` takes a following space.
        let end = self.position;
        let extra = usize::from(count < 6 && self.peek() == 32 && self.next() == 32);
        self.slice(index, end + extra)
    }

    /// `identifier(index)`: the run from `index` up to the next token character.
    fn identifier(&mut self, index: usize) -> &'a [u16] {
        while token(self.peek()) == 0 && self.peek() != 0 {
            self.next();
        }
        self.slice(index, self.position)
    }
}

trait HexDigit {
    fn is_ascii_hexdigit_u16(&self) -> bool;
}

impl HexDigit for u16 {
    fn is_ascii_hexdigit_u16(&self) -> bool {
        matches!(*self, 48..=57 | 65..=70 | 97..=102)
    }
}

/// stylis's `token`: what kind of character `code` is.
fn token(code: u16) -> u8 {
    match code {
        0 | 9 | 10 | 13 | 32 => 5,
        33 | 43 | 44 | 47 | 62 | 64 | 126 | 59 | 123 | 125 => 4,
        58 => 3,
        34 | 39 | 40 | 91 => 2,
        41 | 93 => 1,
        _ => 0,
    }
}

/// Whitespace as JavaScript's `trim` sees it.
fn is_js_whitespace(c: u16) -> bool {
    matches!(
        c,
        0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF
    )
}

fn js_trim(value: &[u16]) -> &[u16] {
    let start = value
        .iter()
        .position(|&c| !is_js_whitespace(c))
        .unwrap_or(value.len());
    let end = value
        .iter()
        .rposition(|&c| !is_js_whitespace(c))
        .map_or(start, |i| i + 1);
    &value[start..end]
}

fn to_utf16(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}

/// `value.replace(/<pattern>/g, replacement)` with JavaScript's replacement
/// patterns: `$$` is `$`, `$&` the match, `` $` `` and `$'` the text before
/// and after it.
fn js_replace_all(value: &[u16], pattern: &[u16], replacement: &[u16]) -> Vec<u16> {
    let mut out = Vec::with_capacity(value.len());
    let mut i = 0;
    while i < value.len() {
        if value[i..].starts_with(pattern) {
            let mut r = 0;
            while r < replacement.len() {
                if replacement[r] == b'$' as u16 && r + 1 < replacement.len() {
                    match replacement[r + 1] {
                        36 => out.push(36),
                        38 => out.extend_from_slice(pattern),
                        96 => out.extend_from_slice(&value[..i]),
                        39 => out.extend_from_slice(&value[i + pattern.len()..]),
                        _ => {
                            out.push(36);
                            r += 1;
                            continue;
                        }
                    }
                    r += 2;
                } else {
                    out.push(replacement[r]);
                    r += 1;
                }
            }
            i += pattern.len();
        } else {
            out.push(value[i]);
            i += 1;
        }
    }
    out
}

/// stylis's `parse` over `key` and the `{` after it, from the parent's
/// `length` (`pseudo`).
fn parse_key(key: &str, pseudo: i32) -> Option<ParsedKey> {
    if key.contains(NODE) {
        return None;
    }
    let mut chars = to_utf16(key);
    chars.push(b'{' as u16);
    let mut t = Tokenizer::new(&chars);
    let mut characters: Vec<u16> = Vec::new();
    let mut points: Vec<i64> = Vec::new();
    let mut offset: usize = 0;
    let mut length: i32 = pseudo;
    let mut previous: u16;
    let mut character: u16 = 0;
    let mut ampersand: i64 = 1;
    loop {
        previous = character;
        character = t.next();
        match character {
            // (
            40 if previous != 108 && charat(&characters, length - 1) == 58 => {
                let run = t.delimit(40)?;
                characters.extend(js_replace_first(&run, &[b'&' as u16], &AMPERSAND_MARK));
                if find(&characters, &AMPERSAND_MARK).is_some() {
                    ampersand = -1;
                }
            }
            // ( " ' [
            40 | 34 | 39 | 91 => characters.extend(t.delimit(character)?),
            // \t \n \r \s
            9 | 10 | 13 | 32 => characters.extend_from_slice(t.whitespace(previous)),
            // \
            92 => {
                let escape = t.escaping(t.position - 1, 7);
                characters.extend_from_slice(escape);
                // stylis continues without passing the escape on as `previous`.
                character = 92;
                continue;
            }
            // /
            47 => match t.peek() {
                42 => {
                    t.next();
                    skip_comment(&mut t)?;
                }
                47 => return None,
                _ => characters.push(47),
            },
            // {
            123 => {
                // Only the `{` after the key ends it; one inside opens a rule.
                if t.position != chars.len() {
                    return None;
                }
                points.push(characters.len() as i64 * ampersand);
                return Some(ParsedKey {
                    characters,
                    points,
                    length,
                });
            }
            // } ; \0
            125 | 59 | 0 => return None,
            _ => {
                if character == 58 {
                    length = 1 + characters.len() as i32;
                }
                characters.push(character);
                match character {
                    // &
                    38 => {
                        if offset > 0 {
                            ampersand = 1;
                        } else {
                            characters.push(0x0C);
                            ampersand = -1;
                        }
                    }
                    // ,
                    44 => {
                        points.push((characters.len() as i64 - 1) * ampersand);
                        ampersand = 1;
                    }
                    // @
                    64 => {
                        if characters.len() != 1 {
                            return None;
                        }
                        if t.peek() == 45 {
                            let dash = t.next();
                            characters.extend(t.delimit(dash)?);
                        }
                        let start = t.position;
                        characters.extend_from_slice(t.identifier(start));
                        offset = characters.len();
                        length = offset as i32;
                        // stylis bumps its `character` here, so the next
                        // `previous` is one past `@`.
                        character = 65;
                    }
                    // `--` opening the key: a custom property, not a selector.
                    45 if previous == 45 && characters.len() == 2 => return None,
                    _ => {}
                }
            }
        }
    }
}

/// Skips a `/* … */` comment after its `/*`, as stylis's `commenter` does.
fn skip_comment(t: &mut Tokenizer) -> Option<()> {
    while t.next() != 0 {
        if t.character == 42 && t.peek() == 47 {
            t.next();
            return Some(());
        }
    }
    None
}

/// `charCodeAt(index) | 0`: 0 outside the string.
fn charat(value: &[u16], index: i32) -> u16 {
    usize::try_from(index)
        .ok()
        .and_then(|i| value.get(i).copied())
        .unwrap_or(0)
}

fn find(value: &[u16], pattern: &[u16]) -> Option<usize> {
    value.windows(pattern.len()).position(|w| w == pattern)
}

/// `value.replace(pattern, replacement)` with a string pattern: the first only.
fn js_replace_first(value: &[u16], pattern: &[u16], replacement: &[u16]) -> Vec<u16> {
    match find(value, pattern) {
        Some(i) => {
            let mut out = value[..i].to_vec();
            out.extend_from_slice(replacement);
            out.extend_from_slice(&value[i + pattern.len()..]);
            out
        }
        None => value.to_vec(),
    }
}

/// stylis's `ruleset`: each list item of `value` composed with each of `rules`.
fn ruleset(value: &[u16], points: &[i64], rules: &[String]) -> Vec<String> {
    let mut props = Vec::new();
    let mut post: i64 = -1;
    for &j in points {
        let begin = usize::try_from(post + 1).unwrap_or(0);
        post = j.abs();
        let end = usize::try_from(post).unwrap_or(0).min(value.len());
        let y: &[u16] = if begin >= end {
            &[]
        } else {
            &value[begin..end]
        };
        for rule in rules {
            let z = if j > 0 {
                let mut out = to_utf16(rule);
                out.push(32);
                out.extend_from_slice(y);
                out
            } else {
                js_replace_all(y, &AMPERSAND_MARK, &to_utf16(rule))
            };
            let z = js_trim(&z);
            if !z.is_empty() {
                props.push(String::from_utf16_lossy(z));
            }
        }
    }
    props
}

/// Emotion's `getRules`: `value`'s list items, an item starting with a colon
/// given a leading `&`, and per item whether it names `&` at its top level.
fn compat_rules(value: &[u16]) -> (Vec<Vec<u16>>, Vec<bool>) {
    let mut t = Tokenizer::new(value);
    let mut parsed: Vec<Vec<u16>> = Vec::new();
    let mut points: Vec<bool> = Vec::new();
    let mut character: u16 = 44;
    loop {
        match token(character) {
            0 if character != 0 => {
                let index = parsed.len() - 1;
                if character == 38 && t.peek() == 12 {
                    points[index] = true;
                }
                let begin = t.position - 1;
                let mut prev: u16;
                let mut current: u16 = 0;
                loop {
                    prev = current;
                    current = t.peek();
                    if prev == 38 && current == 12 {
                        points[index] = true;
                    }
                    if token(current) != 0 || current == 0 {
                        break;
                    }
                    t.next();
                }
                parsed[index].extend_from_slice(t.slice(begin, t.position));
            }
            2 => {
                let index = parsed.len() - 1;
                let run = match t.delimit(character) {
                    Some(run) => run,
                    None => t.slice(t.position.saturating_sub(1), value.len()).to_vec(),
                };
                parsed[index].extend(run);
            }
            4 if character == 44 => {
                let item: Vec<u16> = if t.peek() == 58 {
                    AMPERSAND_MARK.to_vec()
                } else {
                    Vec::new()
                };
                points.push(!item.is_empty());
                parsed.push(item);
            }
            _ => {
                let index = parsed.len() - 1;
                parsed[index].push(character);
            }
        }
        character = t.next();
        if character == 0 {
            break;
        }
    }
    (parsed, points)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Emotion's rules for `color:red` under chains of nested keys, written by
    /// `scripts/codegen-extract-tables.ts`.
    const SELECTOR_CASES: &str = include_str!("../tests/fixture/extract/selectors.json");

    /// The rules this port writes for `color:red` at the end of `chain`.
    fn rules_for(chain: &[String]) -> Option<String> {
        let mut scope = Rule::node();
        let mut at_rules = Vec::new();
        for key in chain {
            if key.starts_with('@') {
                let (text, inner) = scope.at_rule(key)?;
                at_rules.push(text);
                scope = inner;
            } else {
                scope = scope.nest(key)?;
            }
        }
        let class = |s: &String| s.replace(NODE, ".N");
        let props: Vec<String> = scope.props.iter().map(class).collect();
        let mut text: String = prefixed(&props, scope.length)
            .iter()
            .map(|copy| format!("{copy}{{color:red;}}"))
            .collect();
        text.push_str(&format!("{}{{color:red;}}", props.join(",")));
        for at_rule in at_rules.iter().rev() {
            text = format!("{at_rule}{{{text}}}");
        }
        Some(text)
    }

    #[test]
    fn matches_emotion_on_every_chain_of_keys() {
        let cases: Vec<(Vec<String>, String)> =
            serde_json::from_str(SELECTOR_CASES).expect("fixture parses");
        assert!(cases.len() > 3000, "{} cases", cases.len());
        let mismatches: Vec<String> = cases
            .iter()
            .filter_map(|(chain, expected)| {
                let got = rules_for(chain);
                (got.as_deref() != Some(expected.as_str()))
                    .then(|| format!("{chain:?}\n  port    {got:?}\n  Emotion {expected:?}"))
            })
            .collect();
        assert!(
            mismatches.is_empty(),
            "{} mismatches:\n{}",
            mismatches.len(),
            mismatches
                .iter()
                .take(30)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );
    }

    fn props(chain: &[&str]) -> Vec<String> {
        let mut rule = Rule::node();
        for key in chain {
            rule = rule.nest(key).expect(key);
        }
        rule.props.iter().map(|p| p.replace(NODE, ".N")).collect()
    }

    #[test]
    fn keys_compose_as_stylis_composes_them() {
        assert_eq!(props(&["& > p"]), [".N>p"]);
        assert_eq!(props(&["&  ~  .b"]), [".N~.b"]);
        assert_eq!(props(&["a\tb"]), [".N a b"]);
        assert_eq!(props(&[".dark &"]), [".dark .N"]);
        assert_eq!(props(&["&, .other"]), [".N", ".N .other"]);
        assert_eq!(props(&["[data-x=\"&\"] &"]), ["[data-x=\"&\"] .N"]);
        assert_eq!(
            props(&["[data-x=\"a,b\"], &"]),
            [".N [data-x=\"a,b\"]", ".N"]
        );
        assert_eq!(props(&[".a:not(&)"]), [".a:not(.N)"]);
        assert_eq!(props(&[".a:is(&, &)"]), [".a:is(.N, &)"]);
    }

    #[test]
    fn compat_attaches_keys_and_items_starting_with_a_colon() {
        assert_eq!(props(&[":hover"]), [".N:hover"]);
        assert_eq!(props(&["::before"]), [".N::before"]);
        assert_eq!(props(&["::before &"]), [".N::before .N"]);
        assert_eq!(props(&[":not(&)"]), [".N:not(.N)"]);
        assert_eq!(props(&["&, ::after"]), [".N", ".N::after"]);
        assert_eq!(props(&[":hover", "& p"]), [".N:hover p"]);
    }

    #[test]
    fn at_rules_are_written_as_stylis_writes_them() {
        let (text, scope) = Rule::node().at_rule("@media  (min-width:  1px)").unwrap();
        assert_eq!(text, "@media (min-width:  1px)");
        assert_eq!(scope.length, 6);
    }

    #[test]
    fn placeholder_and_read_only_rules_get_vendor_copies() {
        assert_eq!(
            prefixed(&[".N::placeholder".into()], 3),
            [
                ".N::-webkit-input-placeholder",
                ".N::-moz-placeholder",
                ".N:-ms-input-placeholder"
            ]
        );
        assert_eq!(prefixed(&[".N:read-only".into()], 3), [".N:-moz-read-only"]);
        assert!(prefixed(&[".N::placeholder".into()], 0).is_empty());
    }

    #[test]
    fn keys_breaking_out_of_the_rule_are_not_followed() {
        for key in [
            "a{b",
            "a}b",
            "a;b",
            "a // b",
            "a /* b",
            "[x",
            "--x",
            &format!("a{NODE}"),
        ] {
            assert_eq!(Rule::node().nest(key), None, "{key}");
        }
    }
}
