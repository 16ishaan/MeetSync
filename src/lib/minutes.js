const API = (import.meta.env.VITE_TRANSCRIPTION_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

async function request(path, data, timeout = 190000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${API}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data), signal: controller.signal,
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(typeof result.detail === "string" ? result.detail : "Check the meeting text and try again.");
    }
    return response;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("This request timed out. Try a shorter transcript or check your local AI model.");
    if (error instanceof TypeError) throw new Error("MeetSync backend is unavailable. Start it on port 8000 (see README) and try again.");
    throw error;
  } finally { clearTimeout(timer); }
}

export async function generateMinutes(data) {
  return (await request("/minutes", data)).json();
}

export async function downloadMinutesPdf(minutes) {
  const response = await request("/minutes/pdf", minutes, 30000);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${minutes.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "meeting"}-MOM.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
