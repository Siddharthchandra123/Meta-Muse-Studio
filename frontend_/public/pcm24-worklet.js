/* AudioWorklet: capture mono mic samples, downsample to 24 kHz PCM16 and emit 80 ms frames.
   No HTTP access or recording storage. Resampling uses a box averaging filter.
   For research-grade audio quality, replace with a band-limited resampler later. */
class MusePcm24 extends AudioWorkletProcessor {
  constructor() {
    super();
    this.out = new Int16Array(1920); // 80 ms @ 24 kHz
    this.pos = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.sum += Math.max(-1, Math.min(1, channel[i]));
      this.count++;
      this.phase += 24000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        const mean = this.sum / this.count;
        const pcm = mean < 0 ? mean * 32768 : mean * 32767;
        this.out[this.pos++] = Math.max(-32768, Math.min(32767, Math.round(pcm)));
        this.sum = 0;
        this.count = 0;
        if (this.pos === 1920) {
          const frame = this.out.buffer;
          this.port.postMessage(frame, [frame]);
          this.out = new Int16Array(1920);
          this.pos = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('muse-pcm24', MusePcm24);
