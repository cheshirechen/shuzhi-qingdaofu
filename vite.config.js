import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/shuzhi-qingdaofu/',
  plugins: [react(), {
    name: 'local-onnx-runtime',
    buildStart() {
      const output = resolve('public/runtime');
      mkdirSync(output, { recursive: true });
      for (const name of readdirSync('node_modules/onnxruntime-web/dist')) {
        if (/^ort-wasm.*\.(wasm|mjs)$/.test(name)) copyFileSync(resolve('node_modules/onnxruntime-web/dist', name), resolve(output, name));
      }
    },
  }],
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
