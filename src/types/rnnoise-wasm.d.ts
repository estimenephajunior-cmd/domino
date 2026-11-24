declare module '@jitsi/rnnoise-wasm' {
  export interface RnnoiseModule {
    _malloc(bytes: number): number;
    _free(pointer: number): void;
    _rnnoise_create(model?: number): number;
    _rnnoise_destroy(state: number): void;
    /** Float buffers contain 480 samples scaled to the signed 16-bit range. Returns speech probability. */
    _rnnoise_process_frame(state: number, output: number, input: number): number;
    HEAPF32: Float32Array;
  }
  export function createRNNWasmModule(): Promise<RnnoiseModule>;
  export function createRNNWasmModuleSync(): RnnoiseModule;
}
