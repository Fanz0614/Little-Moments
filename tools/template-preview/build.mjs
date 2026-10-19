import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

await build({
  entryPoints: [path.join(here, 'preview.tsx')],
  outfile: path.join(here, 'dist/preview.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  logLevel: 'warning',
  nodePaths: [path.join(root, 'node_modules')],
  alias: {
    '@shopify/react-native-skia': path.join(here, 'skia-shim.ts'),
    '@/render': path.join(root, 'apps/mobile/src/render'),
    '@lm/layout-engine': path.join(root, 'packages/layout-engine/src/index.ts'),
    '@lm/page-schema': path.join(root, 'packages/page-schema/src/index.ts'),
  },
  // Never executed by the preview path; type-only or app-runtime imports.
  external: ['canvaskit-wasm', 'react-native-reanimated', 'react-native', 'expo-sqlite', 'expo-file-system'],
});
