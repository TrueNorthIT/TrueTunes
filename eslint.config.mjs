import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

// style={{…}} in JSX, and Object.assign(el.style, {…}) for elements built in code (drag ghosts).
const INLINE_STYLE = `:matches(JSXAttribute[name.name='style'], CallExpression[callee.object.name='Object'][callee.property.name='assign']:has(> MemberExpression[property.name='style']))`;
const RAW_COLOUR = String.raw`/^\s*(#[0-9a-f]{3,8}|(rgba?|hsla?)\(.*|white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver|navy|teal|maroon|lime|aqua|cyan|magenta)\s*$/i`;
// Any size except tokens and the keyword-ish values that are not a chosen size.
const RAW_SIZE = String.raw`/^(?!var\(|inherit|0$|50%$|100%$)/`;

export default tseslint.config(
  // Ignore build output and generated files
  { ignores: ['**/dist/**', 'node_modules/**', 'storybook-static/**'] },

  // ── All TypeScript (main process + renderer) ─────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // ── Type-aware: promises ─────────────────────────────────────────────────────
  // Only the three promise rules, not recommendedTypeChecked. projectService picks the nearest tsconfig, so this
  // covers the files those projects include: src/, renderer/ and server/src/. The root and server tsconfigs
  // exclude their test files, and config scripts sit outside every project; those keep the untyped rules.
  // TT_LINT_FAST=1 (set by scripts/lint-edited.mjs for the per-edit hook) skips this block: typed linting adds seconds
  // per file. CI and `npm run lint` leave it unset and run the full typed rules.
  ...(process.env.TT_LINT_FAST
    ? []
    : [
        {
          files: [
            'src/**/*.ts',
            'renderer/src/**/*.{ts,tsx}',
            'renderer/.storybook/**/*.{ts,tsx}',
            'server/src/**/*.ts',
          ],
          ignores: ['src/**/*.test.ts', 'server/src/**/*.{test,testkit}.ts'],
          languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
          },
          rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
          },
        },
      ]),

  // ── Renderer: React hooks + fast-refresh ─────────────────────────────────────
  {
    files: ['renderer/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler compatibility check — we don't use the compiler, valid pattern
      'react-hooks/react-compiler': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Design system: inline styles take tokens (var(--…)), never literal colours, px font sizes or radii.
      // Runtime-derived values (template literals, variables such as the artwork accent) are not literals, so pass.
      'no-restricted-syntax': [
        'error',
        {
          selector: `${INLINE_STYLE} Property > Literal[value=${RAW_COLOUR}]`,
          message: 'Raw colour in an inline style: use a var(--…) token (global.css) or a runtime-derived value.',
        },
        {
          selector: `${INLINE_STYLE} Property[key.name=/^(fontSize|borderRadius)$/] > Literal[value=${RAW_SIZE}]`,
          message: 'Raw font size or radius in an inline style: use a --fs-* / --r-* token.',
        },
      ],
    },
  }
);
