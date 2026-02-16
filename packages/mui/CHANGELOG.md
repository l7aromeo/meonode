# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-02-17

### Feature

- **mui**: add new component wrappers and improve formatting ([da952d4](https://github.com/l7aromeo/meonode-mui/commit/da952d4e2fabd2e274cfcbe535f0c7280b16ac1f))
- **mui.lab**: add LoadingButton component ([104529a](https://github.com/l7aromeo/meonode-mui/commit/104529a5bbf5a34090a2835f10f8704ed2347990))
- **mui**: add comprehensive support for MUI X-Charts components ([b6b13ca](https://github.com/l7aromeo/meonode-mui/commit/b6b13ca4bd0790d89b19b45b878508bcd723f336))
- **charts**: add comprehensive support for MUI X Charts Pro ([3e16c7a](https://github.com/l7aromeo/meonode-mui/commit/3e16c7a8fccf11fa111fad024eeb83bbe08d7693))
- **datagrid**: expand and refactor MUI X Data Grid component wrappers ([3438b59](https://github.com/l7aromeo/meonode-mui/commit/3438b5968a28644558e019caf9fa5c5fc7eb60e0))
- **mui**: add type definitions for MUI X Data Grid components ([a982957](https://github.com/l7aromeo/meonode-mui/commit/a982957d22e39666f516eb7555b9edfb9d28e9c1))
- **mui**: expand Data Grid Pro exports and update types ([ed7dffd](https://github.com/l7aromeo/meonode-mui/commit/ed7dffd5ac0cbd5908c81060400b286da7aedcb3))
- **mui**: expand component exports for @mui/x-date-pickers ([366744a](https://github.com/l7aromeo/meonode-mui/commit/36674a4660ed9383f30f6815df3f8795665f38b2))
- **mui**: expand x-date-pickers-pro exports ([8fedb56](https://github.com/l7aromeo/meonode-mui/commit/8fedb56ca7374bedfb8b7988a9df6f11863f82c8))

### Refactor

- **core**: replace NodeElementType with React ElementType ([ce5d1a9](https://github.com/l7aromeo/meonode-mui/commit/ce5d1a950d576c50a95c08921f8858ea8e2a07b9))

### Chore

- **deps**: update dependencies to latest versions ([37bc8b9](https://github.com/l7aromeo/meonode-mui/commit/37bc8b97f39f3d288e5da55571279f522da06f60))
- sort imports and exports in mui.x-tree-view.ts ([7fcfc4d](https://github.com/l7aromeo/meonode-mui/commit/7fcfc4d982f1868aeb9e1ffadfba291c6d12b468))
- alphabetize imports and exports in mui.x-tree-view-pro.ts ([aec594e](https://github.com/l7aromeo/meonode-mui/commit/aec594e9979b7a54cf492cbc0fcdde1bfae20ce2))

## [1.2.2] - 2025-12-12
- chore(deps): update dependencies to latest versions

## [1.2.1] - 2025-12-12
- chore(deps): update Yarn and dependencies to latest versions

## [1.2.0] - 2025-12-05

### Refactor
- improve type parameter definitions in core.ts for MuiNodeFactory and GenericNodeFactory
    - removed default `Record<string, any>` constraints on generic parameters to increase type flexibility
    - added `ExactProps` generic parameter to `GenericNodeFactory` to enhance prop type precision
    - updated related function signatures accordingly without changing runtime behavior

### Chore
- update dependencies to latest versions

## [1.1.1] - 2025-11-20

- fix(core): add optional dependency list parameter to GenericNodeFactory function signatures
- chore(deps): update @meonode/ui and other dependencies to latest versions

## [1.1.0] - 2025-11-14

- chore(release): bump version to 1.1.0
- feat(core): add dependency list parameter to createMuiNode function
- chore(deps): update dependencies to latest versions

## [1.0.72] - 2025-10-30

### Chore

- chore(deps): update dependencies and remove CHANGELOG.md from published files

## [1.0.71] - 2025-09-29

### Feature

- feat(generator): Use direct imports for @mui/material components

## [1.0.70] - 2025-09-29

### Chore

- chore(types): add isFocused property and React.RefAttributes to PieArcOwnerState
- chore(deps): update @meonode/ui to 0.3.8, @mui packages to 8.12.x, eslint-plugin-jsdoc to 60.5.0, and
  typescript-eslint packages to 8.44.1

## [1.0.69] - 2025-09-21

### Chore

- chore(deps): update @meonode/ui to 0.2.19, eslint to 9.36.0, and eslint-plugin-jsdoc to 60.0.0

## [1.0.68] - 2025-09-19

### Chore

- chore(deps): update @meonode/ui to 0.2.18, @mui packages to 8.11.3, and eslint-plugin-jsdoc to 59.0.2

## [1.0.67] - 2025-09-14

### Chore

- chore(deps): update @meonode/ui to 0.2.17 and eslint-plugin-jsdoc to 57.0.7

## [1.0.66] - 2025-09-13

### Chore

- chore(deps): update @meonode/ui to 0.2.16 and @types/react to 19.1.13

## [1.0.65] - 2025-09-12

### Chore

- chore(deps): update @meonode/ui to 0.2.15

## [1.0.64] - 2025-09-12

### Chore

- chore(deps): update @meonode/ui to 0.2.14 and eslint-plugin-jsdoc to 56.1.2

## [1.0.63] - 2025-09-11

### Chore

- chore(deps): update @meonode/ui to 0.2.13 and eslint-plugin-jsdoc to 56.0.2

## [1.0.62] - 2025-09-11

### Chore

- chore(deps): update @meonode/ui to 0.2.12 and MUI components to 8.11.2

## [1.0.61] - 2025-09-10

### Chore

- chore(deps): update dependencies to latest versions including @babel/core, @meonode/ui, and eslint

## [1.0.60] - 2025-09-05

### Added

- **mui**: add type definitions for MUI Lab and X Data Grid components to improve type safety

### Changed

- **core**: enhance type definitions for MUI node factories and improve generic node factory implementation

### Chore

- **deps**: update `@eslint/js` to 9.35.0
- **deps**: bump `@meonode/ui` to 0.2.9

## [1.0.59] - 2025-09-05

### Changed

- Enhance type definitions for MUI node factories
- Improve theme detection logic
- **deps:** update `@meonode/ui` to version `0.2.8`
- **deps:** upgrade MUI packages to version `8.11.1`

## [1.0.58] - 2025-09-04

### Changed

- **deps**: Update peer deps of @meonode/ui to 0.2.7

## [1.0.57] - 2025-09-04

### Changed

- **deps**: Update @meonode/ui to 0.2.6 and eslint-plugin-jsdoc to 54.3.1

## [1.0.56] - 2025-09-03

### Added

- **changelog**: Fix wrong date on CHANGELOG.md for version 1.0.55

## [1.0.55] - 2025-09-03

### Added

- **imports**: Update import paths to include file extensions for compatibility.

## [1.0.54] - 2025-09-02

### Added

- **core**: Exposed the original element for easier access and debugging.
    ```typescript
    import { Box, FormGroup } from "@meonode/mui";

    // Access the underlying element type
    Box({
      component: FormGroup.element,
      // ...
    })
    ```
