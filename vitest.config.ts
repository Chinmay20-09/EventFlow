import {defineConfig,mergeConfig} from 'vitest/config';
import viteConfig from './vite.config.ts';

// `npm run test` launches and verifies frontend-ideal (see scripts/test-frontend-ideal.mjs);
// the root Vitest suite runs as `npm run test:unit` and covers the Vite/React
// command center and the engine.
//
// frontend/, frontend-ideal/ and ideal/ are separate applications with their own
// runners: frontend-ideal uses node:test (`npm test`) and its own Next.js API
// suite. Vitest must not try to execute those node:test files as Vitest suites.
export default mergeConfig(viteConfig,defineConfig({
  test:{
    exclude:['**/node_modules/**','**/dist/**','frontend/**','frontend-ideal/**','ideal/**'],
  },
}));
