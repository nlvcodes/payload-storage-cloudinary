import { configDefaults, defineWorkspace } from 'vitest/config'

const payloadTests = 'src/__tests__/payload/**/*.test.ts'

export default defineWorkspace([
  {
    // Mocked unit tests: the whole Cloudinary SDK and plugin-cloud-storage are mocked in setup.ts.
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      exclude: [...configDefaults.exclude, payloadTests],
      setupFiles: ['./src/__tests__/setup.ts'],
    },
  },
  {
    // Real Payload on SQLite. Only the Cloudinary network calls are mocked, per test file.
    extends: './vitest.config.ts',
    test: {
      name: 'payload',
      include: [payloadTests],
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  },
])
