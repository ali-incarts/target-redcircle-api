/**
 * ESLint Configuration - Airbnb Style Guide
 * Enforces code quality and consistency
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  extends: [
    'airbnb-base',
    'airbnb-typescript/base',
  ],
  rules: {
    // Allow console in development (minimize in production per user's logging preferences)
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',

    // Unused vars with underscore prefix allowed (for Express handlers, etc.)
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],

    // Relax some Airbnb rules for backend development
    'import/prefer-default-export': 'off', // Named exports are fine
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': ['error', { functions: false }],

    // Allow any for specific cases (warn instead of error)
    '@typescript-eslint/no-explicit-any': 'warn',

    // Disable for async functions without await (common in Express)
    'require-await': 'off',

    // Max line length increased for readability
    'max-len': ['warn', { code: 120, ignoreComments: true, ignoreStrings: true }],

    // Allow promise executor
    'no-async-promise-executor': 'warn',

    // Allow ++ operator (common in loops, performance-critical code)
    'no-plusplus': 'off',

    // Allow for-of loops (cleaner than forEach for async/await)
    'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'],

    // Allow Number.isNaN replacement (isNaN is fine for our use case)
    'no-restricted-globals': ['error', 'event', 'fdescribe'],

    // Allow multiple classes per file (for error types)
    'max-classes-per-file': 'off',
  },
  env: {
    node: true,
    es2020: true,
  },
  ignorePatterns: ['dist', 'node_modules', '*.js', '!.eslintrc.js'],
};
