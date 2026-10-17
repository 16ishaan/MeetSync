import { extractMinutes } from "./localMinutes";

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
  // Default to browser mode: no localhost service, CORS or Python dependency.
  if (import.meta.env.VITE_MOM_USE_BACKEND !== "true") return extractMinutes(data);
  try { return await (await request("/minutes", data)).json(); }
  catch {
    const draft = extractMinutes(data);
    draft.notice = "AI backend unavailable. Created a browser extractive draft instead. Review classifications, owners and deadlines before sharing.";
    return draft;
  }
}

export async function downloadMinutesPdf(minutes) {
  const { buildMinutesPdf } = await import("./browserPdf");
  const pdf = await buildMinutesPdf(minutes);
  pdf.save(`${minutes.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "meeting"}-MOM.pdf`);
}
