import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import unusedImports from 'eslint-plugin-unused-imports'
import importX from 'eslint-plugin-import-x'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      'unused-imports': unusedImports,
      import: importX,
    },
    rules: {
      // Core backend rules
      'no-console': 'off', // logging is fine in backend
      'no-debugger': 'warn',

      // Unused imports (AUTO FIX)
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',

      // TypeScript sanity
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',

      // Code quality limits
      'max-lines': ['warn', { max: 350, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 10],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 4],

      // Imports organization
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  // Ignore build output
  {
    ignores: ['dist', 'node_modules', '.gemini'],
  },

  // Disable formatting conflicts
  prettier,
)
