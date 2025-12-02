/**
 * Decodes base64 string to Uint8Array.
 */
export const decodeBase64 = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Merges multiple Uint8Array (PCM) buffers into a single buffer.
 */
export const mergeBuffers = (buffers: Uint8Array[]): Uint8Array => {
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of buffers) {
    result.set(b, offset);
    offset += b.length;
  }
  return result;
};

/**
 * Creates a WAV file header for the given PCM data length.
 */
export const createWavBlob = (pcmData: Uint8Array, sampleRate = 24000): Blob => {
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.length, true);

  return new Blob([view, pcmData], { type: 'audio/wav' });
};

/**
 * Converts a base64 encoded PCM audio string directly to a WAV Blob URL.
 */
export const pcmToWav = (pcmBase64: string, sampleRate = 24000): string => {
  const bytes = decodeBase64(pcmBase64);
  const blob = createWavBlob(bytes, sampleRate);
  return URL.createObjectURL(blob);
};