// @ts-check
import antfu from '@antfu/eslint-config'
import checkFile from 'eslint-plugin-check-file'

export default antfu(
  {
    typescript: true,
    // ESLint handles formatting — no Prettier needed
    stylistic: {
      indent: 2,
      semi: false,
      quotes: 'single',
    },
    // Perfectionist (bundled) handles sorted imports automatically
    ignores: ['dist/**', 'node_modules/**', 'scripts/**'],
  },
  // File & folder naming conventions
  // KEBAB_CASE pattern allows dots so multi-segment names (e.g. health.routes.ts) are valid
  {
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        {
          // Regex: lowercase letters, numbers, dots and hyphens only
          'src/**/*.ts': 'KEBAB_CASE',
          'test/**/*.ts': 'KEBAB_CASE',
        },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': [
        'error',
        {
          'src/**/': 'KEBAB_CASE',
        },
      ],
    },
  },
  // Node.js environment — allow process global in ESM files
  {
    rules: {
      'node/prefer-global/process': 'off',
    },
  },
  // Custom strictness rules
  {
    rules: {
      // No any
      '@typescript-eslint/no-explicit-any': 'error',
      // No unused variables (allow _ prefix for intentionally unused)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Cyclomatic complexity — keep functions simple
      'complexity': ['error', 10],
      // Max lines per file (excluding blanks and comments)
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      // Max lines per function
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      // Max parameters — prefer option objects
      'max-params': ['error', 4],
      // No console — use the Pino logger (only server.ts entry-point is exempt via override below)
      'no-console': 'error',
      // Prefer const
      'prefer-const': 'error',
    },
  },
  // server.ts is the process entry point — allow console for startup banners
  {
    files: ['src/server.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
