import { defineConfig } from 'vitest/config';

// Only pure modules are unit-tested in Node; anything touching Expo/Skia
// native modules is verified on device.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
