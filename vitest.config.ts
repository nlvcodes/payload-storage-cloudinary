import { defineConfig } from 'vitest/config'

// Shared settings. The projects (unit, payload) live in vitest.workspace.ts.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'dev/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/__tests__/payload/harness/**',
      ],
    },
  },
})
