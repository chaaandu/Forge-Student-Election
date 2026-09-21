import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.excel-spool/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-restricted-syntax': [
        'error',
        {
          // Integrity rule: the browser must never be the authority on identity.
          selector: "MemberExpression[object.name='localStorage']",
          message:
            'localStorage must never hold election state. Use sessionStorage for UX-only drafts.',
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // v6 ships flat configs as arrays; `configs.recommended.rules` is
    // undefined, which silently disables every hook rule. Take the rules from
    // the unwrapped entry so the lint actually checks something.
    rules: {
      ...reactHooks.configs['recommended-latest'][0].rules,
    },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
);
