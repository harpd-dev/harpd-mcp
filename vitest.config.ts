import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Tests run against the REAL Harpd dataset files, never against fixtures.
 *
 * By default they read the sibling checkout at ../harpd-ai-datasets via a
 * `file://` base so the run is offline and deterministic. Override with
 * HARPD_DATA_BASE to point at the published raw GitHub mirror instead.
 */
const siblingCheckout = fileURLToPath(new URL('../harpd-ai-datasets/', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      HARPD_DATA_BASE: process.env.HARPD_DATA_BASE || `file://${siblingCheckout}`,
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
