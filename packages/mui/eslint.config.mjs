import js from "@eslint/js";
import tsEslint from 'typescript-eslint'
import prettier from 'eslint-plugin-prettier'
import unusedImports from 'eslint-plugin-unused-imports'
import jsDoc from 'eslint-plugin-jsdoc'
import globals from "globals";

const eslintConfig = [
  {
    ignores: ["**/dist/**", "**/build/**"],
  },
  jsDoc.configs['flat/stylistic-typescript'],
  js.configs.recommended,
  ...tsEslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2026,
      parser: tsEslint.parser,
      globals: {
        ...globals.node,
        ...globals.es2026
      }
    },
    plugins: {
      prettier,
      unusedImports,
      jsDoc
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/consistent-type-definitions': 'error',
      'unusedImports/no-unused-imports': 'error',
      'unusedImports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'jsDoc/require-description': 'warn'
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      // React's declarations are `export =`. A default import of them is copied into
      // the emitted .d.ts, where a consumer on `module: commonjs` without
      // `esModuleInterop` reads it as `any`, and every prop type built on it with it.
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[source.value=/^react(-dom)?(\\/.*)?$/] > ImportDefaultSpecifier",
          message: "Use `import * as React from 'react'` (or `import type * as React`): a default import makes the published declarations `any` for consumers without esModuleInterop.",
        },
      ],
    },
  },
];

export default eslintConfig;
