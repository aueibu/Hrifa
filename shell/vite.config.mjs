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

/** `.test.ts` files that need jsdom (window, document, localStorage, canvas, WebGL probes). */
const DOM_TESTS = [
  'src/pages/composition-workbench/compositionSettings.test.ts',
  'src/pages/composition-workbench/noteEditorPreferences.test.ts',
  'src/pages/composition-workbench/snippet.test.ts',
  'src/pages/composition-workbench/transport.test.ts',
  'src/pages/harmonic-field-lab/audio/plan.test.ts',
  'src/pages/harmonic-field-lab/components/webgl.test.ts',
  'src/pages/harmonic-field-lab/state/followups.test.ts',
  'src/pages/harmonic-field-lab/state/keysModes.test.ts',
  'src/pages/harmonic-field-lab/state/m6.test.ts',
  'src/pages/harmonic-field-lab/state/persist.test.ts',
  'src/pages/scale-explorer/useSoundfont.test.ts',
];

export default defineConfig({
  base: '/Hrifa/',
  plugins: [react(), localSoundfonts()],
  test: {
    globals: true,
    // Node 25+ ships an experimental global localStorage that shadows jsdom's.
    execArgv: ['--no-experimental-webstorage'],
    // Two projects: pure-logic `*.test.ts` run in plain Node (no jsdom, no setup file: about 3x faster),
    // every `*.test.tsx` and the `.test.ts` files that touch the DOM keep jsdom + vitest.setup.mjs.
    // A new `.test.ts` runs in Node by default; if it needs window/document/localStorage, add it to
    // DOM_TESTS below (or write it as `.test.tsx`).
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: DOM_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: './vitest.setup.mjs',
          include: ['src/**/*.test.tsx', ...DOM_TESTS],
          // React Flow is inlined so the d3-drag stub in vitest.setup.mjs reaches it.
          server: { deps: { inline: [/@xyflow/] } },
        },
      },
    ],
  },

  resolve: {
    tsconfigPaths: true,
  },
});
