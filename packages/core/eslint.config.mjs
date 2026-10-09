import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['node_modules/**', 'coverage/**'] },

  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Core runs in Node tests, the React Native app and (later) Electron: everything environmental is injected.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react-native', 'react-native/*', 'expo', 'expo/*', 'expo-*', '@expo/*', 'react-dom', 'react-dom/*'],
              message: 'packages/core must stay platform-neutral: inject the capability from the app instead.',
            },
          ],
        },
      ],
    },
  },
);
