/**
 * momService.js
 * Calls the backend /generate-mom endpoint.
 * Returns a structured MoM object with action items.
 */

const API_URL = import.meta.env.VITE_TRANSCRIPTION_API_URL || 'http://127.0.0.1:8000';

export async function generateMoM({ transcript, meetingTitle = 'Meeting', duration_ms = 0 }) {
  if (!transcript || !transcript.trim()) {
    throw new Error('Transcript is required to generate Minutes of Meeting.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

  try {
    const response = await fetch(`${API_URL}/generate-mom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, meeting_title: meetingTitle, duration_ms }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.detail || `MoM generation failed (HTTP ${response.status}).`);
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('MoM generation timed out. Please try again.');
    }
    throw error;
  }
}

export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) return { healthy: false, reason: `HTTP ${response.status}` };
    const data = await response.json().catch(() => ({}));
    return {
      healthy: true,
      model: data.model,
      ai_configured: Boolean(data.ai_configured),
      ai_provider: data.ai_provider,
    };
  } catch {
    return { healthy: false, reason: 'Service unreachable' };
  }
}
