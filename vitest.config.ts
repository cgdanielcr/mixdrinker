import { defineConfig } from 'vitest/config';

// The sim layer is the only thing under unit test (HANDOVER.md §4, §14):
// render/ is exempt but must contain no gameplay logic.
export default defineConfig({
  test: {
    include: ['src/sim/**/*.test.ts'],
    environment: 'node',
  },
});
