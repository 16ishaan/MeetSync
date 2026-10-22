const TRANSCRIPTION_API_URL =
  import.meta.env.VITE_TRANSCRIPTION_API_URL || "http://127.0.0.1:8000";

export async function transcribeAudio(blob, filename = "recording.webm") {
  const formData = new FormData();
  formData.append("file", blob, filename);

  const response = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
    method: "POST",
    body: formData,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.detail || "Transcription service is unavailable.");
  }

  return result;
}

export async function getSpeakerStatus() {
  const response = await fetch(`${TRANSCRIPTION_API_URL.replace(/\/$/, '')}/speakers/status`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Speaker detection requires the updated local backend.');
  return response.json();
}

export async function transcribeSpeakers(blob, signal, numSpeakers = -1) {
  const form = new FormData();
  form.append('file', blob, blob.type.includes('mp4') ? 'meeting.m4a' : blob.type.includes('ogg') ? 'meeting.ogg' : 'meeting.webm');
  form.append('num_speakers', String(numSpeakers));
  const response = await fetch(`${TRANSCRIPTION_API_URL.replace(/\/$/, '')}/transcribe/speakers`, { method: 'POST', body: form, signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Speaker detection failed. Your live transcript is still available.');
  if (!Array.isArray(result.segments)) throw new Error('Speaker detection returned an invalid response.');
  return result;
}
