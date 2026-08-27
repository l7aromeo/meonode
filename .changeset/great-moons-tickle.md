---
'@meonode/compiler': patch
---

Correct what the README claims about memoization and re-measure the benchmarks.

It said compiled call sites "cannot collide that way". They could: `__meo$k` is
a source-position hash, so it separated distinct call sites, but two instances
of the *same* component share a source position and collided even in a compiled
build. Verified against both a compiled and an uncompiled build before rewriting.

`@meonode/ui@2.0.0-beta` removes the derived-key machinery entirely, which
closes that class and leaves `__meo$k` and `__meo$dyn` emitted but unread. The
measured figures move with it — most of what compiling bought was the signature
hashing the runtime no longer does, so construction reads ~1.7x rather than ~4x
against a runtime that is itself ~2.4x faster. The end-to-end SSR figure has not
been re-run and is now marked unverified rather than left standing as current.
