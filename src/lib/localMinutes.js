// Browser-only, source-grounded fallback. This is deliberately not labeled AI.
export function extractMinutes({ transcript, title, date = "", attendees = "" }) {
  const source = String(transcript || "").trim();
  if (source.length < 20) throw new Error("Add at least 20 characters of meeting transcript.");
  if (source.length > 60000) throw new Error("Keep the transcript under 60,000 characters.");
  const sentences = [...new Set(source.split(/(?<=[.!?।])\s+|\n+/u).map(s => s.trim()).filter(Boolean))];
  const chunks = sentences.flatMap(s => s.match(/[\s\S]{1,1500}/gu) || []);
  const decisions = chunks.filter(s => /\b(agreed|decided|approved|decision|confirmed)\b/i.test(s));
  const actions = chunks.filter(s => /\b(will|must|need to|needs to|action item|assigned|to.do)\b/i.test(s));
  return {
    title: String(title || "Meeting minutes").trim() || "Meeting minutes", date, attendees,
    summary: chunks.slice(0, 3).join(" "), discussion: chunks.slice(0, 50),
    decisions: decisions.slice(0, 50),
    actions: actions.slice(0, 50).map(task => ({ task, owner: "Not specified", due: "Not specified" })),
    next_steps: chunks.filter(s => /\b(next meeting|follow.up|reconvene|next step)\b/i.test(s)).slice(0, 50),
    method: "browser-extractive",
    notice: "Browser draft: source sentences selected using English keyword rules, not an AI summary. Review the classifications and fill in owners and deadlines. No backend required.",
  };
}
