import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {buildMetadata} from '../scripts/build-info.mjs';
const build=buildMetadata({version:JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version,commit:process.env.VCS_REF||process.env.RENDER_GIT_COMMIT,builtAt:process.env.BUILD_DATE||new Date().toISOString(),environment:process.env.BUILD_ENV||'production'});

// https://vitejs.dev/config/
export default defineConfig({
  define:{__EVENTGRID_BUILD__:JSON.stringify(build)},
  plugins: [react(), {
    name: 'eventgrid-pwa-shell',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir || path.resolve(__dirname, 'dist');
      writeFileSync(path.join(outDir,'build-info.json'),JSON.stringify(build));
      const assets = readdirSync(path.join(outDir, 'assets'))
        .filter((name) => /\.(js|css|woff2?)$/.test(name))
        .sort().map((name) => `/assets/${name}`);
      const html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
      const worker = readFileSync(path.join(__dirname, 'public/sw.js'), 'utf8');
      const hash = createHash('sha256').update(html + JSON.stringify(assets) + worker);
      const publicDir = path.join(__dirname, 'public');
      for (const name of readdirSync(publicDir).filter((name) => /\.(svg|png|webmanifest)$/.test(name)).sort()) {
        hash.update(name).update(readFileSync(path.join(publicDir, name)));
      }
      const version = hash.digest('hex').slice(0, 16);
      writeFileSync(path.join(outDir, 'sw.js'), worker
        .replace('__BUILD_VERSION__', version)
        .replace('/* __BUILD_ASSETS__ */ []', JSON.stringify(assets)));
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
