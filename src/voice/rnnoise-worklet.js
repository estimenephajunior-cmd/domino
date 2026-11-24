/* global AudioWorkletProcessor, registerProcessor */
import createRNNWasmModuleSync from './rnnoise-sync.js';
class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = createRNNWasmModuleSync();
    this.handle = this.module._rnnoise_create(0);
    this.pointer = this.module._malloc(480 * 4);
    this.input = new Float32Array(480);
    this.output = new Float32Array(960);
    this.inputOffset = 0;
    this.read = 0;
    this.write = 480;
    this.disposed = false;
    this.port.onmessage = ({ data }) => {
      if (data !== 'dispose' || this.disposed) return;
      this.disposed = true;
      this.module._rnnoise_destroy(this.handle);
      this.module._free(this.pointer);
    };
    this.port.postMessage('ready');
  }
  process(inputs, outputs) {
    if (this.disposed) return false;
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    for (let i = 0; i < output.length; i++) {
      this.input[this.inputOffset++] = (input?.[i] ?? 0) * 32768;
      if (this.inputOffset === 480) {
        const offset = this.pointer >> 2;
        this.module.HEAPF32.set(this.input, offset);
        this.module._rnnoise_process_frame(this.handle, this.pointer, this.pointer);
        for (let j = 0; j < 480; j++) {
          this.output[this.write++ % 960] = this.module.HEAPF32[offset + j] / 32768;
        }
        this.inputOffset = 0;
      }
      output[i] = this.output[this.read++ % 960];
    }
    return true;
  }
}
registerProcessor('rnnoise-processor', RnnoiseProcessor);
