export async function encodeMp3(blob) {
  if (blob.type.split(";")[0] === "audio/mpeg") return blob;
  const context = new OfflineAudioContext(2, 1, 44100);
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  const channels = Array.from({ length: Math.min(decoded.numberOfChannels, 2) },
    (_, index) => decoded.getChannelData(index).slice());
  const worker = new Worker(new URL("./mp3.worker.js", import.meta.url), { type: "module" });
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = event => resolve(event.data);
      worker.onerror = () => reject(new Error("MP3 encoding failed."));
      worker.postMessage(channels, channels.map(channel => channel.buffer));
    });
  } finally {
    worker.terminate();
  }
}
