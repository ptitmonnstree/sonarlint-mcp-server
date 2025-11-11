import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // File patterns
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'sonarlint-backend'],

    // Timeout settings
    testTimeout: 30000, // 30s for integration tests with SLOOP
    hookTimeout: 30000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'sonarlint-backend',
        'tests',
        '*.config.ts',
        'test-*.js',
        'test-*.py'
      ]
    },

    // Separate unit and integration tests
    sequence: {
      // Run unit tests first (faster feedback)
      hooks: 'list'
    },

    // Reporter configuration
    reporters: ['verbose'],

    // Watch mode settings
    watch: false,

    // Global setup/teardown
    // globalSetup: './tests/setup.ts', // Uncomment if needed
    // globalTeardown: './tests/teardown.ts',
  }
});
