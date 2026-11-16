# `@meonode/mui`

[![NPM version](https://img.shields.io/npm/v/@meonode/mui.svg?style=flat)](https://www.npmjs.com/package/@meonode/mui) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A lightweight wrapper around [@mui/material](https://mui.com/) components for use with [`@meonode/ui`](https://www.npmjs.com/package/@meonode/ui) runtime.

**[Documentation](https://ui.meonode.com/docs/mui-integration)** · [MeoNode UI docs](https://ui.meonode.com)

---

## Features
  - ✅ Fully typed MUI component wrappers
  - 🌳 Tree-shakeable exports
  - 🔌 Seamless integration with @meonode/ui
  - ⚡ Lightweight runtime with zero additional abstraction overhead

---

## Installation

To get started with `@meonode/mui`, you need to install the core Material-UI package along with `@emotion` for styling.

```shell
yarn add @mui/material @emotion/react @emotion/styled @meonode/mui
yarn add -D @mui/system @mui/types
```
or
```shell
npm install @mui/material @emotion/react @emotion/styled @meonode/mui
npm install --save-dev @mui/system @mui/types
````

### Optional Packages for Extended Functionality

`@meonode/mui` provides wrappers for various Material-UI X and Lab components. To use these, you need to install the corresponding `@mui` package in your project.

Every `@mui` package other than `@mui/material` is an optional peer dependency, so installing `@meonode/mui` installs none of them, and npm and bun do not warn about the ones you leave out. Importing a path whose package is not installed fails at build or load time with an error naming it, such as `Cannot find package '@mui/x-data-grid'`.

Here's a guide for commonly used extended packages and their corresponding `@meonode/mui` import paths:

| Functionality                | `@meonode/mui` Import Path | Corresponding `@mui` Package to Install     |
| :--------------------------- | :------------------------- | :------------------------------------------ |
| **Next.js integration** | `import { ... } from '@meonode/mui/nextjs16'` (also `nextjs13`, `nextjs14`, `nextjs15`) | `yarn add @mui/material-nextjs` or `npm install @mui/material-nextjs` |
| **Material-UI Lab** | `import { ... } from '@meonode/mui/lab'` | `yarn add @mui/lab` or `npm install @mui/lab` |
| **Data Grid** | `import { ... } from '@meonode/mui/x-data-grid'` | `yarn add @mui/x-data-grid` or `npm install @mui/x-data-grid` |
| **Data Grid Pro** | `import { ... } from '@meonode/mui/x-data-grid-pro'` | `yarn add @mui/x-data-grid-pro` or `npm install @mui/x-data-grid-pro` |
| **Data Grid Premium** | `import { ... } from '@meonode/mui/x-data-grid-premium'` | `yarn add @mui/x-data-grid-premium` or `npm install @mui/x-data-grid-premium` |
| **Date Pickers** | `import { ... } from '@meonode/mui/x-date-pickers'` | `yarn add @mui/x-date-pickers` or `npm install @mui/x-date-pickers` |
| **Date Pickers Pro** | `import { ... } from '@meonode/mui/x-date-pickers-pro'` | `yarn add @mui/x-date-pickers-pro` or `npm install @mui/x-date-pickers-pro` |
| **Tree View** | `import { ... } from '@meonode/mui/x-tree-view'` | `yarn add @mui/x-tree-view` or `npm install @mui/x-tree-view` |
| **Tree View Pro** | `import { ... } from '@meonode/mui/x-tree-view-pro'` | `yarn add @mui/x-tree-view-pro` or `npm install @mui/x-tree-view-pro` |
| **Charts** | `import { ... } from '@meonode/mui/x-charts'` | `yarn add @mui/x-charts` or `npm install @mui/x-charts` |
| **Charts Pro** | `import { ... } from '@meonode/mui/x-charts-pro'` | `yarn add @mui/x-charts-pro` or `npm install @mui/x-charts-pro` |

Make sure to install only the packages you intend to use to keep your project's dependencies minimal.

The Charts paths need `@mui/x-charts` 9.18.0 exactly, and load only through ES modules (`import`, or a bundler). The CommonJS build of `@mui/x-charts` 9.18.0 cannot load: `@mui/x-charts-vendor` 9.18.0 does not ship the `lib-vendor` files its CommonJS entries require, so `require('@meonode/mui/x-charts')` fails with `Cannot find module './lib-vendor/d3-scale/index.js'` ([mui/mui-x#24217](https://github.com/mui/mui-x/issues/24217)).

-----

## Usage

```ts
import { Button } from '@meonode/mui'

const MyComponent = () =>
  Button({
    variant: 'contained',
    color: 'primary',
    children: 'Click me',
    onClick: () => alert('Hello from MUI!'),
  })
```

-----

## Documentation

Full guide, component list and examples: **[ui.meonode.com/docs/mui-integration](https://ui.meonode.com/docs/mui-integration)**

## License

MIT License © 2025 Ukasyah Rahmatullah Zada

See full text in [LICENSE](./LICENSE)
