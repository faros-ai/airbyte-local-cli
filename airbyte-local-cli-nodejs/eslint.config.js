const eslint = require('@eslint/js');
const stylistic = require('@stylistic/eslint-plugin');
const prettier = require('eslint-config-prettier');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  // Global ignores (replaces ignorePatterns)
  {
    ignores: ['lib/**', 'dist/**', 'out/**'],
  },

  // Base configs
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Main configuration with inlined eslint-config-faros rules
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@stylistic': stylistic,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // --- Stylistic rules (moved from deprecated core / @stylistic/ts) ---
      '@stylistic/array-bracket-spacing': 'error',
      '@stylistic/arrow-parens': 'error',
      '@stylistic/comma-spacing': 'error',
      '@stylistic/dot-location': ['error', 'property'],
      '@stylistic/eol-last': 'error',
      '@stylistic/key-spacing': 'error',
      '@stylistic/max-len': ['error', {code: 85, ignoreUrls: true}],
      '@stylistic/member-delimiter-style': 'error',
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': [
        'error',
        {max: 1, maxBOF: 0, maxEOF: 0},
      ],
      '@stylistic/no-tabs': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/no-whitespace-before-property': 'error',
      '@stylistic/object-curly-spacing': 'error',
      '@stylistic/quotes': [
        'error',
        'single',
        {allowTemplateLiterals: true},
      ],
      '@stylistic/semi': 'error',
      '@stylistic/space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
      '@stylistic/space-in-parens': 'error',

      // --- TypeScript rules (overrides for recommended configs) ---
      '@typescript-eslint/array-type': [
        'error',
        {default: 'array', readonly: 'generic'},
      ],
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {assertionStyle: 'as', objectLiteralTypeAssertions: 'allow'},
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-invalid-this': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {checksVoidReturn: false},
      ],
      '@typescript-eslint/no-require-imports': [
        'error',
        {allow: ['/package\\.json$']},
      ],
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'},
      ],
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/unified-signatures': 'error',

      // --- Core ESLint rules ---
      'consistent-return': 'error',
      curly: 'error',
      'default-case-last': 'error',
      'default-param-last': 'error',
      eqeqeq: ['error', 'smart'],
      'no-alert': 'error',
      'no-caller': 'error',
      'no-constant-condition': ['error', {checkLoops: false}],
      'no-constructor-return': 'error',
      'no-duplicate-imports': 'error',
      'no-else-return': 'error',
      'no-eq-null': 'error',
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-extra-label': 'error',
      'no-implicit-globals': 'error',
      'no-label-var': 'error',
      'no-new-wrappers': 'error',
      'no-promise-executor-return': 'error',
      'no-restricted-globals': [
        'error',
        'closed',
        'event',
        'fdescribe',
        'length',
        'location',
        'name',
        'parent',
        'top',
      ],
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-undef-init': 'error',
      'no-unneeded-ternary': ['error', {defaultAssignment: false}],
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-rename': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always', {avoidQuotes: true}],
      'prefer-const': 'error',
      radix: 'error',

      // --- Import sorting ---
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },

  // Prettier (disables conflicting formatting rules) — must be last
  prettier,

  // Re-enable max-len after prettier (local override: 120 chars)
  {
    rules: {
      '@stylistic/max-len': ['error', {code: 120}],
    },
  },
);
