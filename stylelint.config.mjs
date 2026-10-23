// Design-system enforcement for renderer CSS (DESIGN.md). Colours, radii, font sizes and shadows must come from
// the tokens declared in styles/global.css and styles/depth.css, which are the only files allowed raw values.
const ALLOWED = [
  'inherit',
  'initial',
  'unset',
  'currentColor',
  'transparent',
  'none',
  '0',
  '50%',
  '100%',
  '1em',
  /^rgba?\(var\(--[\w-]+\)/, // rgba(var(--tint), a)
  /^color-mix\(/,
];

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-declaration-strict-value'],
  ignoreFiles: ['**/styles/global.css', '**/styles/depth.css', '**/dist/**', 'storybook-static/**', 'node_modules/**'],
  rules: {
    // Colours, radii, font sizes, shadows: tokens only. Mask properties read alpha only, so they are not listed.
    'declaration-strict-value': [
      [
        'color',
        'background',
        'background-color',
        'border',
        'border-color',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
        'outline',
        'outline-color',
        'fill',
        'stroke',
        'caret-color',
        'accent-color',
        'text-decoration-color',
        'border-radius',
        'border-top-left-radius',
        'border-top-right-radius',
        'border-bottom-left-radius',
        'border-bottom-right-radius',
        'font-size',
        'box-shadow',
        'text-shadow',
      ],
      {
        ignoreValues: ALLOWED,
        ignoreFunctions: false,
        disableFix: true,
        message: 'Use a design token: var(--…) (see DESIGN.md).',
      },
    ],
    // CSS Modules: camelCase class names.
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9]*$',
      { message: (name) => `Expected class "${name}" to be camelCase` },
    ],
    // rgba(var(--tint), a) is the house colour form.
    'color-function-notation': null,
    'alpha-value-notation': null,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global', 'local'] }],
    'property-no-unknown': [true, { ignoreProperties: ['composes'] }],
  },
};
