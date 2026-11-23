import {build} from 'esbuild';
import {copyFile, mkdir} from 'node:fs/promises';

export async function buildEscapadaExport(directory = new URL('../dist/assets/escapada-export/', import.meta.url)) {
  await mkdir(directory, {recursive: true});
  await build({
    entryPoints: [new URL('browser/escapada-mp4.mjs', import.meta.url).pathname],
    outfile: new URL('mp4.js', directory).pathname,
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    minify: true, legalComments: 'linked',
  });
  await copyFile(new URL('../node_modules/mediabunny/LICENSE', import.meta.url), new URL('MEDIABUNNY-LICENSE', directory));
}
