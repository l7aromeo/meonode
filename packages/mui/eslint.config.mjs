import js from "@eslint/js";
import tsEslint from 'typescript-eslint'
import prettier from 'eslint-plugin-prettier'
import unusedImports from 'eslint-plugin-unused-imports'
import tsParser from '@typescript-eslint/parser'
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
      parser: tsParser,
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
  }
];

export default eslintConfig;
