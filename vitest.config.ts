import {defineConfig,mergeConfig} from 'vitest/config';
import viteConfig from './vite.config.ts';

// `npm run test` launches and verifies frontend-ideal (see scripts/test-frontend-ideal.mjs);
// the root Vitest suite runs as `npm run test:unit` and covers the Vite/React
// command center (src/) and the engine.
//
// Only this repository's own Vitest suites are collected. Other applications in
// the repository (frontend-ideal) use their own runners and are never scanned.
export default mergeConfig(viteConfig,defineConfig({
  test:{
    include:['tests/**/*.test.{ts,tsx}','engine/tests/**/*.test.ts'],
  },
}));
