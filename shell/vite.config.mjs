import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Dev server only: serves the .sf2 files in a local folder (`local-soundfonts/`, or the folder named by
 * HRIFA_SOUNDFONT_DIR) at /Hrifa/local-soundfonts/, with a JSON listing at its root. The Scale Explorer loads
 * the file named by HRIFA_SOUNDFONT on start, or the only file when the folder holds just one, so a large SoundFont needs no picking after a refresh. The folder is gitignored and
 * is never part of a build.
 *
 * @returns {import('vite').Plugin}
 */
function localSoundfonts() {
  const mount = '/Hrifa/local-soundfonts';
  return {
    name: 'hrifa-local-soundfonts',
    apply: 'serve',
    configureServer(server) {
      const dir = resolve(process.env.HRIFA_SOUNDFONT_DIR ?? 'local-soundfonts');
      server.middlewares.use(mount, (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const list = () =>
          existsSync(dir)
            ? readdirSync(dir)
                .filter((name) => name.toLowerCase().endsWith('.sf2'))
                .map((name) => ({ name, size: statSync(join(dir, name)).size }))
            : [];
        if (path === '' || path === 'index.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({ files: list(), preferred: process.env.HRIFA_SOUNDFONT ?? null })
          );
          return;
        }
        const file = resolve(dir, path);
        if (
          !file.startsWith(dir + sep) ||
          !file.toLowerCase().endsWith('.sf2') ||
          !existsSync(file)
        ) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', statSync(file).size);
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: '/Hrifa/',
  plugins: [react(), localSoundfonts()],
  test: {
    globals: true,
    // Node 25+ ships an experimental global localStorage that shadows jsdom's.
    execArgv: ['--no-experimental-webstorage'],
    environment: 'jsdom',
    setupFiles: './vitest.setup.mjs',
    // React Flow is inlined so the d3-drag stub in vitest.setup.mjs reaches it.
    server: { deps: { inline: [/@xyflow/] } },
  },

  resolve: {
    tsconfigPaths: true,
  },
});
