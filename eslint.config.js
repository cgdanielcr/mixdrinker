import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // HANDOVER.md §4: sim/ is pure logic with zero rendering dependencies.
  // Enforced here so the architecture rule fails the build, not just the review.
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pixi.js', 'pixi.js/*', 'howler', '**/render/*', '**/ui/*', '**/audio/*'],
              message:
                'src/sim must stay pure: no renderer, DOM, or audio imports (HANDOVER.md §4).',
            },
          ],
        },
      ],
      // Sim randomness must come from a seeded Rng (HANDOVER.md §1, §8).
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Never use Math.random in sim/ — use the seeded Rng (HANDOVER.md §8).',
        },
      ],
    },
  },
);
