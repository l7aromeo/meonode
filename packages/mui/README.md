# `@meonode/mui`

[![NPM version](https://img.shields.io/npm/v/@meonode/mui.svg?style=flat)](https://www.npmjs.com/package/@meonode/mui)  
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A lightweight wrapper around [@mui/material](https://mui.com/) components for use with [`@meonode/ui`](https://www.npmjs.com/package/@meonode/ui) and the BaseNode runtime.

---

## Features

- Fully typed MUI component bindings
- BaseNode-compatible layout syntax
- Designed to interoperate seamlessly with `@meonode/ui`

---

## Installation

```shell
yarn add @mui/material @meonode/mui
# or
npm install @mui/material @meonode/mui
```


---

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


---

## License

MIT License © 2025 Ukasyah Rahmatullah Zada

See full text in [LICENSE](./LICENSE)
