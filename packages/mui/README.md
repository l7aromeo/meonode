# `@meonode/mui`

[![NPM version](https://img.shields.io/npm/v/@meonode/mui.svg?style=flat)](https://www.npmjs.com/package/@meonode/mui) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A lightweight wrapper around [@mui/material](https://mui.com/) components for use with [`@meonode/ui`](https://www.npmjs.com/package/@meonode/ui) runtime.

---

## Features
  - ✅ Fully typed MUI component wrappers
  - 🌳 Tree-shakeable exports via subpath entrypoints
  - 🔌 Seamless integration with @meonode/ui
  - ⚡ Lightweight runtime with zero additional abstraction overhead

---

## Installation

To get started with `@meonode/mui`, you need to install the core Material-UI package along with `@emotion` for styling.

```shell
yarn add @mui/material @emotion/react @emotion/styled @meonode/mui
```
or
```shell
npm install @mui/material @emotion/react @emotion/styled @meonode/mui
````

### Optional Packages for Extended Functionality

`@meonode/mui` provides wrappers for various Material-UI X and Lab components. To use these, you need to install the corresponding `@mui` package in your project. This ensures you have the necessary underlying libraries for the specific components you wish to use, satisfying the peer dependencies.

Here's a guide for commonly used extended packages and their corresponding `@meonode/mui` import paths:

| Functionality                | `@meonode/mui` Import Path | Corresponding `@mui` Package to Install     |
| :--------------------------- | :------------------------- | :------------------------------------------ |
| **Material-UI Lab** | `import { ... } from '@meonode/mui/lab'` | `yarn add @mui/lab` or `npm install @mui/lab` |
| **Data Grid** | `import { ... } from '@meonode/mui/x-data-grid'` | `yarn add @mui/x-data-grid` or `npm install @mui/x-data-grid` |
| **Data Grid Pro** | `import { ... } from '@meonode/mui/x-data-grid-pro'` | `yarn add @mui/x-data-grid-pro` or `npm install @mui/x-data-grid-pro` |
| **Data Grid Premium** | `import { ... } from '@meonode/mui/x-data-grid-premium'` | `yarn add @mui/x-data-grid-premium` or `npm install @mui/x-data-grid-premium` |
| **Date Pickers** | `import { ... } from '@meonode/mui/x-date-pickers'` | `yarn add @mui/x-date-pickers` or `npm install @mui/x-date-pickers` |
| **Tree View** | `import { ... } from '@meonode/mui/x-tree-view'` | `yarn add @mui/x-tree-view` or `npm install @mui/x-tree-view` |
| **Tree View Pro** | `import { ... } from '@meonode/mui/x-tree-view-pro'` | `yarn add @mui/x-tree-view-pro` or `npm install @mui/x-tree-view-pro` |
| **Charts** | `import { ... } from '@meonode/mui/x-charts'` | `yarn add @mui/x-charts` or `npm install @mui/x-charts` |
| **Charts Pro** | `import { ... } from '@meonode/mui/x-charts-pro'` | `yarn add @mui/x-charts-pro` or `npm install @mui/x-charts-pro` |

Make sure to install only the packages you intend to use to keep your project's dependencies minimal.

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

## License

MIT License © 2025 Ukasyah Rahmatullah Zada

See full text in [LICENSE](./LICENSE)
