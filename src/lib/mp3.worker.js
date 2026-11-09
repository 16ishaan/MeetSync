import { Mp3Encoder } from "@breezystack/lamejs";

self.onmessage = ({ data: channels }) => {
  const encoder = new Mp3Encoder(channels.length, 44100, 128);
  const parts = [];
  for (let start = 0; start < channels[0].length; start += 1152) {
    const pcm = channels.map(channel =>
      Int16Array.from(channel.subarray(start, start + 1152), value => {
        const sample = Math.max(-1, Math.min(1, value));
        return sample * (sample < 0 ? 32768 : 32767);
      })
    );
    const frame = encoder.encodeBuffer(...pcm);
    if (frame.length) parts.push(frame);
  }
  parts.push(encoder.flush());
  self.postMessage(new Blob(parts, { type: "audio/mpeg" }));
};
