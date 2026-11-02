/** Encode mono 16-bit PCM WAV. No ffmpeg or browser extension required. */
export function encodeWavMono(samples: Float32Array, sampleRate = 24000): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || samples.length > 24000 * 90) {
    throw new Error('Unsupported audio sampling parameters.');
  }
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  function label(position: number, value: string) {
    for (let i = 0; i < value.length; i++) view.setUint8(position + i, value.charCodeAt(i));
  }
  label(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); label(8, 'WAVE');
  label(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  label(36, 'data'); view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.min(1, Math.max(-1, samples[i] || 0));
    view.setInt16(44 + i * 2, Math.round(s < 0 ? s * 32768 : s * 32767), true);
  }
  return new Uint8Array(buffer);
}

/** Decode recorded browser audio, downmix/resample and package for Muse ASR. */
export async function recordingToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < 0.1 || decoded.duration > 90) {
      throw new Error('Recording must be between 0.1 and 90 seconds.');
    }
    const targetRate = 24000;
    const resampler = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const source = resampler.createBufferSource();
    source.buffer = decoded;
    source.connect(resampler.destination);
    source.start(0);
    const rendered = await resampler.startRendering();
    const encoded = encodeWavMono(rendered.getChannelData(0), targetRate);
    // Slice into a new ArrayBuffer so TypeScript's BlobPart typing stays portable.
    return new Blob([new Uint8Array(encoded)], { type: 'audio/wav' });
  } finally {
    await ctx.close();
  }
}
