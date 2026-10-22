export const MAX_SPEAKER_BYTES = 30 * 1024 * 1024;
export const MAX_SPEAKER_MS = 15 * 60 * 1000;

export async function startSpeakerRecording({ mediaDevices = navigator.mediaDevices, Recorder = MediaRecorder, onLimit }) {
  const stream = await mediaDevices.getUserMedia({ audio: true });
  try {
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => Recorder.isTypeSupported(t));
    const recorder = type ? new Recorder(stream, { mimeType: type }) : new Recorder(stream);
    const chunks = [];
    let bytes = 0;
    let discarded = false;
    let timer;
    let settle;
    const completed = new Promise(resolve => { settle = resolve; });
    const release = () => { clearTimeout(timer); stream.getTracks().forEach(track => track.stop()); };
    const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); return completed; };
    recorder.ondataavailable = event => {
      bytes += event.data.size;
      if (bytes > MAX_SPEAKER_BYTES) {
        discarded = true;
        stop();
        onLimit('Recording reached 30 MB. Your live text is kept; start a shorter speaker recording.');
      } else if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => { release(); settle(discarded ? null : new Blob(chunks, { type: recorder.mimeType })); };
    recorder.onerror = () => { discarded = true; release(); settle(null); onLimit('Audio recording failed. Your live text is kept.'); };
    recorder.start(1000);
    timer = setTimeout(() => { stop(); onLimit('Reached the 15-minute speaker recording limit.'); }, MAX_SPEAKER_MS);
    return { stop, cancel: () => { discarded = true; stop(); release(); } };
  } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
}
