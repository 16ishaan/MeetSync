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
