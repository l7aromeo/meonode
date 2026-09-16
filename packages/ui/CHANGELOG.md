# @meonode/ui

## 2.3.0

### Minor Changes

- [#24](https://github.com/l7aromeo/meonode/pull/24) [`793c4fb`](https://github.com/l7aromeo/meonode/commit/793c4fb128dca4101d458807e0c006bdbc13c324) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Let a themed page be one document for every reader.

  A themed SSR page could not be cached, because the provider rendered its
  `:root{--meonode-theme-*}` block from whichever theme it held and the application
  picked that theme per reader. Measured on a live site, light and dark differed in
  all 62 theme variables and the documents were different sizes.

  A second provider, `ThemeModesProvider`, renders markup that does not depend on
  the mode:

  ```ts
  ThemeModesProvider({
    tokens, // one map; values are var() refs
    modes: ['morning', 'night'],
    system: { light: 'morning', dark: 'night' }, // optional
    defaultMode: 'morning',
    children,
  })
  ```

  Token values are `var()` references, the palettes live in CSS keyed by
  `[data-theme="…"]`, and a blocking script sets that attribute before the first
  paint. The server then renders one document for everyone, with no flicker,
  because there was never a wrong first paint to correct.

  It takes one token map plus mode names rather than a theme per mode so the
  cacheable property holds by construction: with a single map the emitted block is
  the same whatever the reader stored, so the bytes cannot vary. A record of themes
  would let an application put the per-reader variation straight back.

  `useTheme()` gains `mode`, `preference`, `setMode` and `setPreference` beside
  what it already returned. Only `mode` is meaningful under `ThemeProvider`, where
  it reads the current theme's own mode; `preference` is absent there and the two
  setters throw, naming `ThemeModesProvider`. Changing a mode while keeping the
  theme's `system` would not be a mode switch on that path — the palettes are
  different objects with different values, so it would emit one mode's variables
  under the other's name. `preference` is what the reader chose — possibly
  `'system'` — and `mode` is what that resolves to; storing the resolved value
  instead would make following the OS impossible, since the first toggle would pin
  it. `'system'` is offered only when the `system` mapping is given, because
  `prefers-color-scheme` answers in the OS's words and an application whose modes
  are `'morning'` and `'night'` has not said which is which until it says so.

  Two behaviours change on the new path only. `useTheme` no longer writes the
  document: every consumer runs it, so a write there was a write per reader of the
  theme, which is how a provider on its default could overwrite a choice just made.
  And the mode is no longer compared against `'dark'` — the attribute is set to the
  mode name whatever it is, so a mode called `'sepia'` is no longer treated as
  light. `ThemeProvider({ theme })` keeps its existing behaviour exactly, including
  the class swapping, and is unaffected.

  **`ThemeModesProvider` is the path to build on.** `ThemeProvider` keeps the
  shorter name only because taking it would break every existing application, not
  because it is the better default — a themed page it renders still varies per
  reader. The intended direction is that a future major makes `ThemeProvider` mean
  this behaviour and the theme-swapping shape takes a legacy name or goes.

  Two components rather than two shapes on one, because `createNode` infers a
  component's props and a union of the two collapses to `never` there, which stops
  every existing call site compiling. Keeping them separate also means a
  half-configured provider — `tokens` without `modes` — is a compile error rather
  than a throw at render. For the same reason there is no runtime rule about
  passing both: the situation cannot be expressed, since neither component accepts
  the other's props. `ThemeProvider` itself is untouched.

  The provider renders `defaultMode` on its first pass — server and client alike —
  and adopts the reader's real mode in a layout effect, exposing `hydrated` on the
  context so a consumer can gate on the handover. Reading the attribute or storage
  while rendering makes the two first renders differ for every reader whose mode is
  not the default, which React requires to be identical. Alone that is invisible;
  combined with a consumer that renders anything from `mode` — a toggle's position,
  a different icon, a component present in only one mode — React throws [#418](https://github.com/l7aromeo/meonode/issues/418),
  discards the server tree and client-renders the document. The readers who trigger
  it are exactly those who chose a non-default mode, which is rarely whoever is
  testing, so `hydrated` exists to let such a consumer wait for the handover
  deliberately.

  The page itself does not flash: page-level theming is CSS keyed off the attribute
  the pre-paint script already wrote. Only React markup that depends on the mode
  takes a second pass.

  `defaultPreference` says what a reader who has never chosen starts on, which the
  mode cannot express: `defaultMode: 'night'` means "dark when nothing is stored",
  while `defaultPreference: 'system'` means "follow the OS until told otherwise".
  It defaults to `defaultMode`, a stored choice outranks it, and `'system'` without
  a `system` mapping throws at construction — unlike a _stored_ `'system'` with no
  mapping, which is a reader's leftover and degrades quietly. The field is also
  what lets one configuration literal feed both the pre-paint script and the
  provider, which is not possible while only one half declares it.

  A site that declares its mode names through `MeoTheme` gets them everywhere. The
  provider's props, the mapping in `system`, and everything `useTheme()` hands back
  — `mode`, `modes`, `setMode`, `setPreference` — take `ResolvedThemeMode`, which
  is `MeoTheme['mode']` when augmented and the loose `ThemeMode` when not, so an
  un-augmented site is unaffected. Augmented, `setMode('nigth')` stops compiling;
  before, every string was accepted and autocomplete offered `'light'` and `'dark'`
  to a site that uses neither. A misspelt mode is consistent with itself, so no
  runtime check can catch it — `defaultMode` is a member of `modes`, every
  validation passes, and no stylesheet matches.

  Rejections are explicit rather than silent. A mode that is not in `modes`, and
  `'system'` without the mapping, are both ignored with a development warning
  instead of setting a `data-theme` no selector matches. Passing `theme` alongside
  `tokens` takes the mode path and says so once. A stored value that is not one of
  the declared modes is discarded for `defaultMode`, which is also what makes an
  upgrade safe: the original path writes `localStorage.theme` as a _mode_ and this
  one stores a _preference_ under the same default key, so a leftover value is
  honoured when it is still a declared mode and dropped otherwise.

  `ThemeMode` was `'light' | 'dark' | string`, which collapses to `string` and lost
  even those two from autocomplete. It is now `'light' | 'dark' | (string & {})`,
  which keeps them as hints without closing the set. `MeoTheme` augmentation of
  `mode` still overrides it.

- [#24](https://github.com/l7aromeo/meonode/pull/24) [`8ad3e5e`](https://github.com/l7aromeo/meonode/commit/8ad3e5e72398e24f0510acda841bc124c15f0612) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Apply the theme before the first paint, from a script the server can cache.

  A document that names the reader's mode in its markup cannot be shared: either
  every reader gets their own render, or somebody gets the wrong one and watches it
  correct itself. `themeScript(config)` removes the reason to do either. It returns
  a plain inline `<script>` node for `<head>` that reads the stored preference and
  stamps the resolved mode on the document element, in the window after that
  element exists and before the first paint. Palettes live in CSS keyed by
  `[data-theme="…"]`, so the server sends one document to everybody and there is no
  flicker, because there was never a wrong first paint to correct.

  ```ts
  const theme = {
    modes: ['morning', 'night'],
    defaultMode: 'morning',
    system: { light: 'morning', dark: 'night' }, // optional
    defaultPreference: 'system', // optional; defaults to defaultMode
  } as const

  Html({
    suppressHydrationWarning: true,
    children: [
      Head({ children: [themeScript(theme), Link({ rel: 'stylesheet', href: '/app.css' })] }),
      Body({ children: ThemeModesProvider({ ...theme, tokens, children }) }),
    ],
  })
  ```

  The field names are the provider's, so one object feeds both and the two cannot
  drift.

  **The configuration travels in an attribute; the body is a constant.** The
  element is `<script data-meonode-theme='{…}'>` with a fixed body that reads that
  attribute back and parses it. Nothing an application names is ever interpolated
  into JavaScript, so a mode called `a</script>…` has no context to escape from —
  the injection class is absent rather than defended against. It also means the
  body is the same bytes for every application and every configuration, so under a
  hash-only CSP its `script-src 'sha256-…'` is one value that never changes, rather
  than one per application that moves whenever somebody renames a mode.

  `THEME_SCRIPT_CSP_HASH` is exported alongside it, so a policy can name the
  script without rendering anything first:

  ```ts
  headers.set('Content-Security-Policy', `script-src 'self' '${THEME_SCRIPT_CSP_HASH}'`)
  ```

  Take it from the package rather than copying the digest out of rendered output.
  A copied literal goes stale the first time this body changes, and that failure is
  silent in every way a test usually looks. The policy is still valid, the element
  is still in the document, and the page still settles in the right mode, because
  the provider applies it after hydration. The one symptom is that `data-theme` is
  absent _until_ hydration — which is precisely the flash the script exists to
  prevent, and nothing downstream of hydration can observe it.

  Three assertions make that visible, and none of them costs anything in the
  script:

  - the served `script-src` contains `THEME_SCRIPT_CSP_HASH`. This catches a stale
    literal exactly, before a browser is involved.
  - no `csp-violation` report arrives. Measured against a deliberately stale
    hash, a `ReportingObserver` for `csp-violation` with `buffered: true` reports
    it with `effectiveDirective: 'script-src-elem'` even when it is registered
    after the page has loaded, which a test usually is. A
    `securitypolicyviolation` listener has to be in place before the parser
    reaches the script, so it is the wrong shape for this.
  - `data-theme` is present _before_ hydration — read it at `load`, not after.
    After hydration the provider has written it and the check can no longer fail.

  A policy whose hashes are derived from the rendered response, as a hashing proxy
  does, is unaffected: it re-derives the digest per response and never holds a copy
  to go stale.

  **`defaultPreference` is where a reader starts; `defaultMode` is where everything
  lands when it fails.** They are usually the same and do not have to be, and only
  the first can be `'system'`. A first visit is the one case where the OS
  preference is all that is known about what the reader wants, and `defaultMode`
  cannot express following it: it has to name a mode, and a mode may not be called
  `system`. So a site that wants to begin by asking the OS says
  `defaultPreference: 'system'`, and still names a `defaultMode` for when nothing
  can answer — a blocked storage, a missing `matchMedia`, a stored mode that has
  since been renamed. Omitted, it is `defaultMode`, so nothing existing moves.

  **A site that declares its modes gets them checked.** `modes`, `defaultMode`,
  `defaultPreference` and both sides of `system` are typed as `ResolvedThemeMode`,
  which is `MeoTheme['mode']` when a site augments it and the loose `ThemeMode`
  when it does not — so an un-augmented site sees no change at all, and an
  augmented one gets autocomplete for its own names and a compile error on a
  misspelt one. That case is otherwise invisible: a typo in `modes` is consistent
  with itself, so `defaultMode` is still a member of `modes`, every runtime check
  passes, and the only symptom is a stylesheet that matches nothing.

  ```ts
  declare module '@meonode/ui' {
    interface MeoTheme {
      mode: 'morning' | 'night'
    }
  }
  ```

  **Three things an application has to do, and the reasons they are not optional:**

  - **Put the script as early in `<head>` as the framework allows.** A classic
    inline script that follows a `<link rel="stylesheet">` cannot execute until
    that sheet has loaded. Measured in the Next app router, first is not
    achievable: React hoists a `data-precedence` stylesheet above anything a
    layout renders. That costs latency rather than correctness — the sheet ahead
    of it is render-blocking too, so nothing is painted before the script runs —
    but a slow or third-party stylesheet ahead of it delays the mode for no
    reason.
  - **Define a usable palette at `:root`, with `[data-theme="…"]` blocks as
    overrides.** Every failure path — blocked storage, a sandboxed frame, a missing
    `matchMedia` — ends with no `data-theme` written. Palettes that exist only
    under the attribute leave those readers with an unstyled page, which is a worse
    outcome than the wrong mode.

  The pre-paint claim is asserted as far as it can be: a probe placed immediately
  after the script in `<head>` reports the attribute already set, which bounds the
  write to before the body is parsed. That is a one-sided bound and not a
  comparison against first paint, which the Paint Timing API did not make
  available.
  - **Set `suppressHydrationWarning` on the element the script writes to.** The
    attribute is not in the server markup, which is the definition of a mismatch.

  **Failures are contained where containing them helps.** `localStorage` throws on
  property access, not merely from `getItem`, where site data is blocked and in a
  sandboxed iframe without `allow-same-origin`; that read is guarded on its own so
  those readers still get the default rather than nothing. `matchMedia` is guarded
  separately too, falling back to the light name, which is what the provider falls
  back to as well. A stored `system` with no mapping resolves to the default
  instead of stamping the word `system`, which no palette matches.

  **A configuration that cannot work throws.** An empty `modes`, a `defaultMode` or
  a `system` value that is not one of them, a `defaultPreference` that is neither a
  mode nor `'system'`, a `defaultPreference: 'system'` with no mapping to say what
  the OS's words mean here, a mode named `system`, or a name outside
  `[A-Za-z0-9_-]{1,64}`. Not gated on development: the configuration is
  authored rather than data, so a check that fired only in development would let CI
  pass and production ship a script that stamps a mode no selector matches. The
  name restriction is for the application's sake — a mode name is the one value
  that crosses from this configuration into `[data-theme="…"]` selectors written by
  hand.

### Patch Changes

- [#24](https://github.com/l7aromeo/meonode/pull/24) [`78fef6d`](https://github.com/l7aromeo/meonode/commit/78fef6dec93e172654801ca54e50041634ee406e) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Say which shape produced a missing-key report.

  The call-site line named where a generated list was written. When that list has
  been spread in beside children written out by hand, the child React names is
  usually one of those siblings — a heading has no key because nobody writes keys
  on headings — while the rows, which do have keys, look like the problem. The
  reader audits the rows.

  When a marked list holds both keyed and unkeyed children, the line now says so
  and names the fix, which is not the same fix as the all-unkeyed case:

  ```
  [MeoNode] A generated list at app/page.tsx:41:7 has children without a `key`.
  React reports the missing key itself; this names the call site it came from.
  Some children here do have keys: a spread puts a generated list and the siblings
  written beside it into one list, so React asks those siblings for keys too. Nest
  the generated part instead of spreading it.
  ```

  The explanation no longer waits for a line number. The call site needs the
  plugin's `callSiteLocations` option, which most builds do not set; the shape
  needs only the list marker, which every compiled build emits. So a build without
  locations now gets the clause, plus a line saying which option would name the
  file:

  ```
  [MeoNode] A generated list has children without a `key`. Some children here do
  have keys: a spread puts a generated list and the siblings written beside it
  into one list, so React asks those siblings for keys too. Nest the generated
  part instead of spreading it. Turn on `callSiteLocations` in the
  @meonode/compiler plugin options to have this name the file and line.
  ```

  Without a location, only the mixed case speaks. React already reports an
  all-unkeyed list correctly, and repeating that with no line number is noise.

  A list where nothing is keyed is left alone — there the fix is keys, and blaming
  the spread would send the reader the wrong way.

## 2.2.1

### Patch Changes

- [#21](https://github.com/l7aromeo/meonode/pull/21) [`9425c1b`](https://github.com/l7aromeo/meonode/commit/9425c1b060f25fbf39ec69eb918000a5be981bae) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Type `children` as the nesting the runtime already accepts.

  2.2.0 let a `children` array contain arrays, and `Children` was never widened
  with it:

  ```ts
  export type Children = NodeElement | NodeElement[]
  ```

  So the types permitted exactly the shape the runtime change exists to replace —
  a spread — and rejected the one it enables:

  ```
  error TS2322: Type '(NodeInstance<"span"> | NodeInstance<"span">[])[]' is not
  assignable to type 'NodeElement<NodeElementType, Record<string, unknown>>[]'
  ```

  It is now recursive, and its arrays are readonly so that an `as const` list is a
  valid children list:

  ```ts
  export type Children = NodeElement | readonly Children[]
  ```

  `readonly` costs existing callers nothing — a mutable array is assignable to a
  readonly one, and the patterns that read an array back out of a `Children` value
  go through `Array.isArray`, which narrows to `any[]` either way. Checked against
  the built `.d.ts` from a consumer project: mutating after a guard, returning one
  as `NodeElement[]`, spreading one, and passing a `NodeElement[]` as children all
  compile before and after; only the nested form changes answer.

  The accompanying `.test-d.ts` is the part that was missing. Nesting was mutation
  tested, RSC tested and measured for allocation, and still shipped unusable from
  TypeScript, because every one of those tests exercises the feature from
  JavaScript — where the annotation has no say.

## 2.2.0

### Minor Changes

- [#19](https://github.com/l7aromeo/meonode/pull/19) [`04959df`](https://github.com/l7aromeo/meonode/commit/04959dfbeb0ed34c0d2841e8ce865f5a31e1668e) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Say where an unkeyed list came from.

  React cannot answer that in a MeoNode app. `Div({...})` only builds a node;
  `createElement` fires later inside `.render()`, so React attributes every element
  in the tree to that one call — every missing key anywhere in a file reports at
  the same line, and the owner stack collapses to the same component for the same
  reason.

  The compiler already computed the call site and discarded it. With the new
  `callSiteLocations` option it emits the source position, and the runtime names it
  beside React's own report rather than in place of it:

  ```
  [MeoNode] A generated list at src/app/page.ts:124:6 has children without a `key`.
  ```

  It prints only when a child actually lacks a key, so a correctly keyed list stays
  silent. It also prints in the one case React says nothing at all: a marked list
  whose children reach a host element through an unmarked wrapper, where the
  variadic hand-off tells React a human wrote the siblings out.

  Opt in through the plugin options. The locations are absent from any build that
  does not ask for them; with them on, the whole of a 55-file app grew by 759 bytes
  gzipped.

- [#19](https://github.com/l7aromeo/meonode/pull/19) [`04959df`](https://github.com/l7aromeo/meonode/commit/04959dfbeb0ed34c0d2841e8ce865f5a31e1668e) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Let a `children` array contain arrays.

  `Div({ children: [Span('a'), items.map(render)] })` used to throw `Objects are
not valid as a React child`, naming MeoNode's internal fields. The only way to
  combine siblings you wrote out with a generated list was to spread them into one
  array — and a spread is the one shape that costs those siblings React's
  missing-key exemption, because React grants it only while the generated part
  stays a nested array.

  So the shape that read most clearly was the shape the library then reported on.
  Nesting now works at any depth, and behaves as React does:

  ```ts
  // the heading is exempt; the list is still key-checked
  Div({ children: [Span('heading'), rows.map(r => Row({ key: r.id, ...r }))] })
  ```

  A children array that contains itself is dropped at the self-reference with a
  development warning rather than overflowing the stack, and a function child
  inside a nested array is normalised like any other — it previously went missing
  from the output with nothing said.

  Flat arrays, which are nearly all of them, skip the new traversal entirely:
  measured against the previous release, zero allocation difference on the flat,
  single-child and props-only shapes.

### Patch Changes

- [#19](https://github.com/l7aromeo/meonode/pull/19) [`04959df`](https://github.com/l7aromeo/meonode/commit/04959dfbeb0ed34c0d2841e8ce865f5a31e1668e) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Report a throwing function-as-a-child, and stop paying to ask whether to.

  A function child that threw had its error swallowed and its result replaced with
  `null`, so the element vanished from the page with nothing printed unless
  `setDebugMode` happened to be on — and nobody discovers `setDebugMode` from a
  blank space. The error belongs to the caller, so it now appears in development
  like any other diagnostic. MeoNode's own recovery paths stay behind
  `setDebugMode`: a compiled marker bucket collision, a failed prototype probe and
  a key-name fallback are the library recovering from itself, and nobody outside it
  can act on them.

  Separately, `diagnosticsEnabled()` read `process.env.NODE_ENV` on every call,
  which in Node is a native `getenv` rather than a property read — roughly 112ns
  against 0.9ns for a boolean. It is consulted at every recursion level of the
  theme diagnostics, once per styled node, on every render, while the function's
  own documentation claimed production cost a single boolean check. The
  environment is now read once. `setDebugMode` still takes effect at runtime.

- [#19](https://github.com/l7aromeo/meonode/pull/19) [`04959df`](https://github.com/l7aromeo/meonode/commit/04959dfbeb0ed34c0d2841e8ce865f5a31e1668e) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Catch a node passed as a DOM attribute on a plain HTML tag.

  `Div({ title: Span('x') })` rendered `title="[object Object]"` and said nothing.
  It now throws, naming the prop and the call site.

  Host tags only. Passing a node in a prop to a _component_ stays supported — the
  receiver may put it into its own children, where it resolves correctly, and only
  the receiver knows which was meant. A plain tag has no receiver, so the case is
  decidable and always wrong.

## 2.1.0

### Minor Changes

- [#16](https://github.com/l7aromeo/meonode/pull/16) [`4d42425`](https://github.com/l7aromeo/meonode/commit/4d4242580e8d205d6d2eaf5a91cdfd7ac50727e6) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Report an unkeyed list, the way React does.

  **Expect new warnings on code that compiles clean today.** Any keyless
  `items.map(fn)` list starts reporting React's own missing-key warning once it is
  built with a compiler that emits the marker, and run on a `@meonode/ui` that
  understands it — this release or later. That is the feature working — those
  lists reconcile by position, so a delete or a reorder already hands a row the
  previous row's state — but it is a behaviour change, not a silent fix.
  The warning itself is development-only. The decision behind it is not free
  in production, but it is close: one property read and one falsy test per
  compiled node, short-circuiting before anything else on a call site whose
  children were not generated. Adding a `key` to each row
  resolves it, and is the fix for the underlying bug too.

  `For`, added in this same release, is the ergonomic way to do that: it takes the
  data rather than the finished rows and keys each one from it, so no key has to be
  threaded through every row by hand. It is a plain runtime helper and needs no
  compiler — which matters here, because this warning only appears for builds that
  use `@meonode/compiler`, while the positional-reconciliation bug it reports is
  there either way. If you are not compiling, you will not see the warning and
  `For` still fixes the problem.

  **Both halves are required, and an old pairing is worse than no pairing.** A
  compiler that emits `__meo$list` running against an earlier `@meonode/ui`
  produces no warnings at all — it produces console noise instead. No earlier
  runtime strips the key, so it reaches the element, and React rejects
  `__meo$list` as an attribute name and says so once per render of every marked
  call site, on the same console channel the key warnings would have used.
  Rendering is unaffected and production is untouched, but the diagnostic is not
  merely absent, it is replaced by something louder and less useful.

  Test for the capability rather than a version, since it is the capability that
  decides: a runtime understands the key when its `COMPILER_SCHEMA_KEYS` entries
  for schemas 2 and 3 carry a `list` field. That stays true however the version
  numbers land. This is a compatibility requirement of the marker contract, not a
  bug in either half — upgrade both together.

  An unkeyed list reconciles by position, so deleting or reordering a row hands
  the next one the row before it — its state, its focus, whatever the user had
  typed into it. React reports that; MeoNode did not, for any list, because
  `render()` spreads children variadically:

  ```js
  createElement(div, null, a, b) // 0 reports
  createElement(div, null, [a, b]) // 1 report, same children
  ```

  Separate arguments are React's signal that a human wrote the siblings out, so
  it marks them validated and never asks for keys. Every MeoNode list took that
  form, so every list was silently exempt from the check — including the ones
  that most needed it.

  The spread is not going away: it is what keeps authored siblings quiet, which
  is a promise the library makes deliberately. Only children the compiler has
  marked as generated — a `.map()`, a spread, an IIFE, a helper call — are now
  handed to React as one array, and React raises its own warning from there. No
  message is reimplemented here.

  That distinction has to come from the compiler, because it cannot be recovered
  at runtime: arguments are evaluated before the callee runs, so `items.map(fn)`
  has already collapsed into an ordinary array by the time `Div({ children })` is
  entered, indistinguishable from one typed out by hand. Inferring list-ness from
  the value would nag in exactly the places React stays quiet. `@meonode/compiler`
  sets `__meo$list` on a generated call site; this release is the half that reads
  it, on marker schemas 2 and 3.

  A generated list is reported however few rows it holds — a `.map()` over one row
  is exactly the list that grows to three later, carrying the bug with it. The
  marker says the expression was generated; the value it produced still decides,
  so `children: row`, a variable holding a single node that the compiler cannot
  see inside, stays silent. React draws the line in the same place: an unkeyed
  one-element array is reported, a bare child is not.

  Nothing about reconciliation changes. Spread and array reconcile identically —
  both wrong unkeyed, both correct keyed — so this restores a diagnostic and
  nothing else. Uncompiled code, and code compiled by a version that does not set
  the marker, behaves exactly as before.

- [#16](https://github.com/l7aromeo/meonode/pull/16) [`d377a51`](https://github.com/l7aromeo/meonode/commit/d377a5134fb29ada3d1dc7809fb3d3d2e400afd2) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `For`, a list helper that keys rows from the data.

  React matches unkeyed children by position, so deleting or reordering a list
  hands each surviving row the previous row's fiber — its state, its focus,
  whatever the user had typed into it. `children: items.map(...)` inherits that
  in full, and nothing in the library can fix it after the fact: by the time
  `Div({ children: ... })` is called, `.map()` has already run and its result is
  an ordinary array, indistinguishable _at runtime_ from one written out by
  hand. The compiler can still tell them apart, because it sees the source —
  that is what the list diagnostic in this release is built on. But knowing a
  list was generated is not the same as knowing which row is which, so it can
  report the problem and only the data can fix it.

  `For` takes the data instead of the finished nodes, so the identity is still
  there to use:

  ```js
  Div({ children: For(todos, todo => TodoRow({ todo })) })
  ```

  The callback receives `(item, index, key)`, matching `Array.map` rather than
  inverting it — the key is the one `For` applied, there for a row that wants to
  reuse it and ignorable otherwise.

  Rows are identified by object reference, which survives their contents
  changing — renaming a row keeps its state, where hashing the contents would
  discard it on every keystroke. Primitives identify themselves by value, and
  two genuinely identical items fall back to their position, which is no worse
  than the unkeyed list they replace.

  Reference identity cannot follow items that are rebuilt between renders, so
  `For(items, renderItem, item => item.id)` takes an explicit accessor. In
  development, a list whose items are _all_ new on a second render is reported
  once, with that suggestion — on the first render every object is new, which
  says nothing, so the check waits for a repeat before concluding anything.

  Unkeyed `children: items.map(...)` still _reconciles_ exactly as it does in
  React — by position, so a delete or a reorder hands a row the previous row's
  state. What changed in this release is that you now hear about it: see the
  list-diagnostic entry above. `For` is the ergonomic answer to that warning, and
  unlike the warning it needs no compiler.

### Patch Changes

- [#16](https://github.com/l7aromeo/meonode/pull/16) [`5769190`](https://github.com/l7aromeo/meonode/commit/57691901ff7b960d705b8f86eafdff25a6cd8f90) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Rebuild a memoized subtree when the node behind it is a different node.

  Every node given `deps` renders as a `MeoMemo` element, so two structurally
  different subtrees in the same position presented React with the same
  component type. React kept the fiber where it would otherwise have
  remounted, and `useMemo` — seeing `deps` compare equal — returned the
  element built for the _previous_ node:

  ```js
  Div({ children: cond ? Div({ children: 'A' }, []) : Section({ children: 'B' }, []) })
  // after cond flips: still <div>A</div>
  ```

  A key did not rescue it either. Giving the slot one stable key, which is the
  natural thing to write, still rendered the stale branch; only _differing_
  keys worked, which is the opposite of how keys behave everywhere else.

  `node.element` now joins the dependency list. The element type is stable for
  a given call site, so an ordinary re-render still hits the memo, while a
  genuine swap invalidates it.

  This restores React's own rule rather than inventing one. Measured against
  plain React with `useMemo([])` in both directions: a swap between two
  different component types remounts and rebuilds, and a swap between two of
  the same type keeps the frozen value. `[]` continues to mean freeze, exactly
  as `useMemo([])` does.

  This is a separate mechanism from the list diagnostic in this release, and
  does not change it: unkeyed lists still reorder and delete exactly as they do
  in React, and still need a `key`.

## 2.0.2

### Patch Changes

- [#14](https://github.com/l7aromeo/meonode/pull/14) [`aeb8791`](https://github.com/l7aromeo/meonode/commit/aeb8791c4cc828577d165d08f8dc3d09e157ad79) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Scope server-rendered styles to the request that produced them.

  The Emotion cache a server render collects into was reached through
  `getGlobalState`, a plain module-level object, so one cache served every
  request in the process and `cache.inserted` accumulated every style ever
  rendered. `StyleRegistry` flushes that cache into the response, and its
  per-request dedupe set cannot tell "this request's styles" from "some
  earlier request's", so each page shipped the union of every route the
  process had touched.

  Measured on the documentation site: `/docs/hooks` needs 32 KB of CSS and was
  serving 166 KB — 5.2x — with 189 of its 237 declared classes belonging to
  other pages. It grows towards the union of the whole site as more routes are
  hit, and it lands on a document that is `no-store` because of the CSP nonce,
  so nothing can cache it away.

  `StyleRegistry` now opens a scope per render and the compiler writes into
  that. Same page, same server: **166 KB -> 32 KB**, and stable across repeat
  requests instead of growing.

  A scope adopts any rules compiled before it opened. `StyleRegistry` is a
  client component, so it renders in the SSR pass, after the server components
  above it have already compiled their `css` — scoping without that step
  stranded their rules, putting the class in the markup while its declaration
  never reached the document. The existing coverage for a themed `Link` on a
  server page caught it.

  Three tests were added around the concurrency case, since the scope is held
  in a module-level binding: a route must emit the same styles whether it
  renders alone or alongside others, two routes rendering together must not
  absorb each other's, and one route fetched twice with traffic in between
  must not grow.

  Client rendering is untouched; `bun run bench` is unchanged.

## 2.0.1

### Patch Changes

- [#12](https://github.com/l7aromeo/meonode/pull/12) [`09d74ba`](https://github.com/l7aromeo/meonode/commit/09d74bafc8bb27638d86b4ce2a1a32a7f4341a99) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Remove four internal members left behind when the element cache was replaced.

  `NodeUtil.hashString`, `NodeUtil.hashCSS`, `NodeUtil.isStyleProp` and
  `NodeUtil.shouldNodeUpdate` all existed to serve the derived-key element
  cache — hashing props into a lookup string, and deciding whether a node's
  dependency list allowed it to be skipped. Nothing computes a key or a
  signature any more, so all four lost their last caller and shipped inert.

  Confirmed dead before removing: each appears exactly once across `src`,
  `tests`, `scripts` and `bench` — its own definition — and zero times in
  `@meonode/mui`, `@meonode/compiler` or the documentation site. `NodeUtil`
  is not exported from any package entry (`.`, `./client`,
  `./nextjs-registry`), so none of them were reachable from outside the
  package and no consumer can be relying on them.

  No behaviour change. All suites pass unchanged: 270 unit, 271 compiled,
  76 RSC in each mode.

## 2.0.0

### Major Changes

- [#10](https://github.com/l7aromeo/meonode/pull/10) [`7482625`](https://github.com/l7aromeo/meonode/commit/74826251a0f5c28b9e9b54620da28141db77f470) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Replace the element cache with fiber-backed memoization.

  A node given `deps` had its rendered element held in one process-global `Map`,
  keyed by a string derived from the node's props and its position under the
  render root. Deriving identity that way carried two structural bugs:

  - **Collisions.** Two different subtrees that derived the same string shared one
    entry, and the second rendered the first's content. React composes what a
    component returns, so the positional chain restarted at every component
    boundary — which made two components with structurally identical trees, and
    two instances of one component, both collide. `@meonode/compiler` narrowed
    this with `__meo$k`, a source-position hash, but could not close it: two
    instances of the same component share a source position.
  - **No release.** Only a render root carried an unmount hook, so a memoized
    _child_ was never evicted when it unmounted. Twenty memoized rows, list
    emptied, whole tree unmounted, left twenty entries — cleared only by the next
    SPA navigation.

  A memoized subtree now renders inside a `MeoMemo` fiber holding
  `useMemo(() => node.render(), deps)`. Identity is the fiber, so there is nothing
  to derive and nothing to collide, for plain function components and `Component`
  alike. Release is React dropping the fiber. `deps` semantics are unchanged.

  Faster, not slower, because the derived key is what cost the most:

  |                                | before   | after            |
  | ------------------------------ | -------- | ---------------- |
  | node construction              | 31.89 ms | 13.24 ms (2.4x)  |
  | client render                  | 23.73 ms | 17.07 ms (1.39x) |
  | 200 memoized rows x 31 renders | 14.85 ms | 8.74 ms (1.70x)  |
  | entries left after unmount     | 200      | 0                |

  `deps` now means literally what React means by it. Previously the cache key
  folded in a signature of the node's props, so a prop change invalidated the
  entry regardless of the dependency list — `deps: []` did not really mean "never
  rebuild", it meant "rebuild whenever a prop changes". The list is now handed
  straight to `useMemo`, so `deps: []` freezes the subtree and a node that should
  follow a value has to declare it:

  ```js
  // 1.x rebuilt this when `id` changed. It no longer does.
  Div({ ...props, padding: '4px' }, [])

  // Declare what it follows.
  Div({ ...props, padding: '4px' }, [props.id])
  ```

  Server rendering is untouched: nothing was ever memoized there, and `MeoMemo` is
  client-only and rendered rather than called, so it never crosses an RSC
  boundary.

  **Breaking.** Everything the derived key needed is gone:

  - `BaseNode.elementCache`, `BaseNode.cacheCleanupRegistry`, `BaseNode.clearCaches`
    and `Node.clearCaches`
  - `NodeInstance.signature` and the deprecated `NodeInstance.stableKey`
  - `NodeUtil.createPropSignature`, `NodeUtil.hashDynamicValues`,
    `NodeUtil.extractCriticalProps`, `NodeUtil.shouldCacheElement`
  - `MountTrackerUtil` and `NavigationCacheManagerUtil`, including its
    `history.pushState` / `replaceState` patching
  - `render()`'s `parentBlocked` and `scope` parameters. `render(container, node)`
    from `@meonode/ui/client` no longer needs a per-container namespace and takes
    the same arguments as before.

  Most applications call none of these. Code that called `Node.clearCaches()`
  between tests or on navigation can simply drop the call.

  `@meonode/compiler` output stays compatible. `__meo$k` and `__meo$dyn` are
  accepted and stripped, just no longer read, so the plugin remains a pure
  build-time speedup — a smaller one, because uncompiled construction got much
  faster.

### Patch Changes

- [#9](https://github.com/l7aromeo/meonode/pull/9) [`20936ea`](https://github.com/l7aromeo/meonode/commit/20936ea22a397eed3e9d8db8bbfe44bbcd256382) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Publish the prerelease line from CI, and preflight releases properly.

  CI ran only on `main`, and the Release workflow only fired on a successful CI
  run for `main`, so the `beta` line had no sanctioned publish path at all —
  leaving a laptop as the only option. `@meonode/ui` and `@meonode/compiler` set
  `publishConfig.provenance`, which npm can only satisfy from a provider it
  recognises, so a local `changeset publish` shipped `@meonode/mui` (no
  provenance) and then failed on the other two. That left a released package
  whose peer dependency did not exist on the registry.

  Both workflows now trigger on `beta` as well, so the prerelease line publishes
  the same way `main` does, with attestations intact. The trigger has to be
  listed on the default branch to take effect at all — GitHub reads a
  `workflow_run` workflow from there, so editing it on `beta` alone changes
  nothing.

  Added `bun run release:dry`, run in the release job before anything is
  published. `npm publish --dry-run` alone would not have caught this: it packs
  the tarball and reports success without ever evaluating
  `publishConfig.provenance`. The preflight checks what actually decides the
  outcome — that every package asking for provenance is somewhere it can be
  minted (on GitHub Actions, that means `id-token: write`, not merely "in CI"),
  and that no version is already on the registry — then defers to
  `npm publish --dry-run` for packing, `files` and auth.

## 2.0.0-beta.0

### Major Changes

- [`7482625`](https://github.com/l7aromeo/meonode/commit/74826251a0f5c28b9e9b54620da28141db77f470) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Replace the element cache with fiber-backed memoization.

  A node given `deps` had its rendered element held in one process-global `Map`,
  keyed by a string derived from the node's props and its position under the
  render root. Deriving identity that way carried two structural bugs:

  - **Collisions.** Two different subtrees that derived the same string shared one
    entry, and the second rendered the first's content. React composes what a
    component returns, so the positional chain restarted at every component
    boundary — which made two components with structurally identical trees, and
    two instances of one component, both collide. `@meonode/compiler` narrowed
    this with `__meo$k`, a source-position hash, but could not close it: two
    instances of the same component share a source position.
  - **No release.** Only a render root carried an unmount hook, so a memoized
    _child_ was never evicted when it unmounted. Twenty memoized rows, list
    emptied, whole tree unmounted, left twenty entries — cleared only by the next
    SPA navigation.

  A memoized subtree now renders inside a `MeoMemo` fiber holding
  `useMemo(() => node.render(), deps)`. Identity is the fiber, so there is nothing
  to derive and nothing to collide, for plain function components and `Component`
  alike. Release is React dropping the fiber. `deps` semantics are unchanged.

  Faster, not slower, because the derived key is what cost the most:

  |                                | before   | after            |
  | ------------------------------ | -------- | ---------------- |
  | node construction              | 31.89 ms | 13.24 ms (2.4x)  |
  | client render                  | 23.73 ms | 17.07 ms (1.39x) |
  | 200 memoized rows x 31 renders | 14.85 ms | 8.74 ms (1.70x)  |
  | entries left after unmount     | 200      | 0                |

  `deps` now means literally what React means by it. Previously the cache key
  folded in a signature of the node's props, so a prop change invalidated the
  entry regardless of the dependency list — `deps: []` did not really mean "never
  rebuild", it meant "rebuild whenever a prop changes". The list is now handed
  straight to `useMemo`, so `deps: []` freezes the subtree and a node that should
  follow a value has to declare it:

  ```js
  // 1.x rebuilt this when `id` changed. It no longer does.
  Div({ ...props, padding: '4px' }, [])

  // Declare what it follows.
  Div({ ...props, padding: '4px' }, [props.id])
  ```

  Server rendering is untouched: nothing was ever memoized there, and `MeoMemo` is
  client-only and rendered rather than called, so it never crosses an RSC
  boundary.

  **Breaking.** Everything the derived key needed is gone:

  - `BaseNode.elementCache`, `BaseNode.cacheCleanupRegistry`, `BaseNode.clearCaches`
    and `Node.clearCaches`
  - `NodeInstance.signature` and the deprecated `NodeInstance.stableKey`
  - `NodeUtil.createPropSignature`, `NodeUtil.hashDynamicValues`,
    `NodeUtil.extractCriticalProps`, `NodeUtil.shouldCacheElement`
  - `MountTrackerUtil` and `NavigationCacheManagerUtil`, including its
    `history.pushState` / `replaceState` patching
  - `render()`'s `parentBlocked` and `scope` parameters. `render(container, node)`
    from `@meonode/ui/client` no longer needs a per-container namespace and takes
    the same arguments as before.

  Most applications call none of these. Code that called `Node.clearCaches()`
  between tests or on navigation can simply drop the call.

  `@meonode/compiler` output stays compatible. `__meo$k` and `__meo$dyn` are
  accepted and stripped, just no longer read, so the plugin remains a pure
  build-time speedup — a smaller one, because uncompiled construction got much
  faster.

## 1.8.7

### Patch Changes

- [#1](https://github.com/l7aromeo/meonode/pull/1) [`5d234ac`](https://github.com/l7aromeo/meonode/commit/5d234acb9d15dc77de33eff8624d5eb9a2622e37) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Point the package metadata at the new monorepo. `repository`, `bugs` and `homepage` referenced the three separate repositories that have now been merged into [l7aromeo/meonode](https://github.com/l7aromeo/meonode), and each package gains a `repository.directory` so npm links to its own subtree. No functional change — npm reads these fields from the published tarball, so a release is the only way to correct them.
