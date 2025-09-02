# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
