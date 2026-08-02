# @meonode/mui

## 1.5.11

### Patch Changes

- [#1](https://github.com/l7aromeo/meonode/pull/1) [`5d234ac`](https://github.com/l7aromeo/meonode/commit/5d234acb9d15dc77de33eff8624d5eb9a2622e37) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Point the package metadata at the new monorepo. `repository`, `bugs` and `homepage` referenced the three separate repositories that have now been merged into [l7aromeo/meonode](https://github.com/l7aromeo/meonode), and each package gains a `repository.directory` so npm links to its own subtree. No functional change — npm reads these fields from the published tarball, so a release is the only way to correct them.
