import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Serve installed voice assets locally in development and emit the same URLs at build. */
export function voiceAssets(): Plugin {
  const files = new Map([
    ['silero_vad_v5.onnx', 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx'],
    ['vad.worklet.bundle.min.js', 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js'],
    ['rnnoise-sync.js', 'node_modules/@jitsi/rnnoise-wasm/dist/rnnoise-sync.js'],
    ['rnnoise-worklet.js', 'src/voice/rnnoise-worklet.js'],
    ...[
      'ort-wasm.wasm',
      'ort-wasm-simd.wasm',
      'ort-wasm-threaded.wasm',
      'ort-wasm-simd-threaded.wasm',
    ].map((name) => [name, `node_modules/onnxruntime-web/dist/${name}`] as [string, string]),
  ]);
  const cache = new Map<string, Promise<Buffer>>();
  const asset = (file: string) => {
    let content = cache.get(file);
    if (!content) {
      content = readFile(path.resolve(import.meta.dirname, file));
      cache.set(file, content);
    }
    return content;
  };
  return {
    name: 'local-voice-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0]?.replace(/^\/voice\//, '');
        const file = req.url?.startsWith('/voice/') && name ? files.get(name) : undefined;
        if (!file) {
          next();
          return;
        }
        void asset(file)
          .then((content) => {
            res.setHeader(
              'Content-Type',
              file.endsWith('.wasm')
                ? 'application/wasm'
                : file.endsWith('.js')
                  ? 'text/javascript'
                  : 'application/octet-stream',
            );
            res.end(content);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      for (const [name, file] of files)
        this.emitFile({ type: 'asset', fileName: `voice/${name}`, source: await asset(file) });
    },
  };
}
