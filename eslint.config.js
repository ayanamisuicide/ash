import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'legacy-js/**',
      'data/**',
      'scripts/**',
      'tests/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // SPA веб-панели: браузерный JS без типов, поэтому только глобалы браузера
    files: ['src/web/public/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        history: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URLSearchParams: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        NodeJS: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
