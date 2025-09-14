# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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