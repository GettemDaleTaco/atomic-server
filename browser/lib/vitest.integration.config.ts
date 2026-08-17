import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    // Use a dedicated setup that does NOT set `ws-disconnected` — these
    // tests spawn a real atomic-server and need the Store's WebSocket
    // to actually open. The shared unit-test setup mocks the WS away.
    setupFiles: ['tests/integration-setup.ts'],
    testTimeout: 60_000,
    // Every one of these files boots a real atomic-server in `beforeAll`,
    // which takes ~25s in CI for a debug build (initialize + tantivy index).
    // Vitest's hook timeout is a separate knob from `testTimeout` and
    // defaults to 10s, so each file had to remember to pass `60_000` as
    // beforeAll's second argument — server-fixture didn't, and failed CI.
    hookTimeout: 60_000,
    // The integration tests share a single WASM runtime via NodeClientDb;
    // running files in parallel surfaces "Rust value borrowed" panics at
    // teardown. Run each file in its own fresh fork (a new process) so the
    // WASM module is loaded and torn down in isolation.
    fileParallelism: false,
    pool: 'forks',
    isolate: true,
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
});
