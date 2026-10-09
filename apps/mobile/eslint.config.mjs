import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Ignore generated native projects (Continuous Native Generation), caches and build output
  { ignores: ['android/**', 'ios/**', '.expo/**', 'node_modules/**', 'coverage/**'] },

  // ── All TypeScript ────────────────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // ── React hooks (screens, components and the ported hooks) ────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler compatibility checks - we don't use the compiler; same stance as the desktop repo
      'react-hooks/react-compiler': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Flags the standard PanResponder/gesture pattern (refs read from handlers built during render)
      // used by the Slider and the debug spike screen; those are correct as written.
      'react-hooks/refs': 'off',
    },
  },
);
