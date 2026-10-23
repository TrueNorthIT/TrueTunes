// Design-system enforcement for renderer CSS (DESIGN.md). Colours, radii, font sizes and shadows must come from
// the tokens declared in styles/global.css and styles/depth.css, which are the only files allowed raw values.
// A raw colour literal: hex, rgb(a)/hsl(a) with numbers, or a named colour (as in the old cssTokens test).
const RAW_COLOUR = String.raw`.*(?:#[0-9a-f]{3}|\b(?:rgba?|hsla?)\(\s*[\d.]|\b(?:white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver|navy|teal|maroon|lime|aqua|cyan|magenta)\b)`;
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
  String.raw`/^rgba?\(var\(--[\w-]+\)/`, // rgba(var(--tint), a)
  String.raw`/^color-mix\(/`,
  // The 13px floor around a token or the inherited size (DESIGN.md: no text under 13px).
  String.raw`/^max\(13px, (var\(--fs-[\w-]+\)|1em)\)$/`,
  // Gradients pass so long as no colour in them is a raw literal.
  `/^(?!${RAW_COLOUR})(?:radial|linear|conic)-gradient\\(/is`,
];

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-declaration-strict-value'],
  ignoreFiles: ['**/styles/global.css', '**/styles/depth.css', '**/dist/**', 'storybook-static/**', 'node_modules/**'],
  rules: {
    // Colours, radii, font sizes, shadows: tokens only. Mask properties read alpha only, so they are not listed.
    'scale-unlimited/declaration-strict-value': [
      [String.raw`/color$/`, 'fill', 'stroke', String.raw`/radius$/`, 'font-size'],
      {
        expandShorthand: true,
        ignoreValues: ALLOWED,
        ignoreFunctions: false,
        disableFix: true,
        message: 'Use a design token: var(--…) (see DESIGN.md).',
      },
    ],
    // Shadows must be built from tokens (var(--art-shadow), rgba(var(--tint), a)): no raw colour, at least one var().
    // Catch-all, so no raw colour hides in filter, custom properties and the like. Masks read alpha only: exempt.
    'declaration-property-value-disallowed-list': [{ '/^(?!-?(webkit-)?mask)/': [new RegExp(RAW_COLOUR, 'i')] }],
    'declaration-property-value-allowed-list': [
      { '/shadow$/': ['none', '0', 'inherit', 'initial', 'unset', /var\(--/] },
    ],
    // CSS Modules: camelCase class names.
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9]*$',
      { message: (name) => `Expected class "${name}" to be camelCase` },
    ],
    'value-keyword-case': ['lower', { camelCaseSvgKeywords: true }], // currentColor
    'length-zero-no-unit': null, // `0px` in a gradient position is harmless
    'declaration-property-value-no-unknown': [true, { ignoreProperties: { appearance: ['slider-vertical'] } }],
    // rgba(var(--tint), a) is the house colour form.
    'color-function-notation': null,
    'alpha-value-notation': null,
    // Purely stylistic rules that fire hundreds of times on code that is fine (listed in the PR).
    'rule-empty-line-before': null,
    'comment-empty-line-before': null,
    'at-rule-empty-line-before': null,
    'declaration-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'color-function-alias-notation': null, // we write rgba(), not rgb(… / a)
    'keyframes-name-pattern': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'property-no-vendor-prefix': null, // -webkit-backdrop-filter, -webkit-line-clamp: still needed in Chromium
    'no-descending-specificity': null, // noisy with CSS Modules, where each file owns its classes
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global', 'local'] }],
    'property-no-unknown': [true, { ignoreProperties: ['composes'] }],
  },
};
