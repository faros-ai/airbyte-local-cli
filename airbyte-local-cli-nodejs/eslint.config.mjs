import {defineConfig} from 'eslint/config';
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['lib/**', 'dist/**', 'out/**', 'node_modules/**', 'eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@stylistic': stylistic,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // Stylistic rules
      '@stylistic/member-delimiter-style': 'error',
      '@stylistic/quotes': ['error', 'single', {allowTemplateLiterals: 'always'}],
      '@stylistic/semi': 'error',

      // TypeScript rules
      '@typescript-eslint/array-type': ['error', {default: 'array', readonly: 'generic'}],
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {assertionStyle: 'as', objectLiteralTypeAssertions: 'allow'},
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-invalid-this': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-misused-promises': ['error', {checksVoidReturn: false}],
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
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/unified-signatures': 'error',
      '@typescript-eslint/no-require-imports': ['error', {allow: ['/package\\.json$']}],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // Core ESLint rules
      'array-bracket-spacing': 'error',
      'arrow-parens': 'error',
      'comma-spacing': 'error',
      'consistent-return': 'error',
      curly: 'error',
      'default-case-last': 'error',
      'default-param-last': 'error',
      'dot-location': ['error', 'property'],
      'eol-last': 'error',
      eqeqeq: ['error', 'smart'],
      'key-spacing': 'error',
      'max-len': ['error', {code: 120, ignoreUrls: true}],
      'no-alert': 'error',
      'no-caller': 'error',
      'no-constructor-return': 'error',
      'no-constant-condition': ['error', {checkLoops: false}],
      'no-duplicate-imports': 'error',
      'no-else-return': 'error',
      'no-eq-null': 'error',
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-extra-label': 'error',
      'no-implicit-globals': 'error',
      'no-implied-eval': 'error',
      'no-label-var': 'error',
      'no-loss-of-precision': 'error',
      'no-multi-spaces': 'error',
      'no-multiple-empty-lines': ['error', {max: 1, maxBOF: 0, maxEOF: 0}],
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
      'no-tabs': 'error',
      'no-throw-literal': 'error',
      'no-trailing-spaces': 'error',
      'no-undef-init': 'error',
      'no-unneeded-ternary': ['error', {defaultAssignment: false}],
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-rename': 'error',
      'no-var': 'error',
      'no-whitespace-before-property': 'error',
      'object-curly-spacing': 'error',
      'object-shorthand': ['error', 'always', {avoidQuotes: true}],
      'prefer-const': 'error',
      radix: 'error',
      'require-await': 'error',
      'space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
      'space-in-parens': 'error',

      // Import sorting
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  }
);
