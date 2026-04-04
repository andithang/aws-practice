import js from '@eslint/js';
import html from '@html-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';
import jsonc from 'eslint-plugin-jsonc';
import jsoncParser from 'jsonc-eslint-parser';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.aws-sam/**',
      'dist/**',
      'frontend/.next/**',
      'frontend/out/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.json'],
    languageOptions: {
      parser: jsoncParser
    },
    plugins: {
      jsonc
    },
    rules: {
      'jsonc/no-dupe-keys': 'error',
      'jsonc/valid-json-number': 'error'
    }
  },
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: htmlParser
    },
    plugins: {
      '@html-eslint': html
    },
    rules: {
      '@html-eslint/no-duplicate-attrs': 'error',
      '@html-eslint/no-duplicate-id': 'error'
    }
  }
);
