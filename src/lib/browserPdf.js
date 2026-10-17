// Render text with the device's fonts so non-Latin text is not silently dropped.
// Exported pages are images, preserving appearance rather than searchable text.
export async function buildMinutesPdf(minutes, createCanvas = () => document.createElement("canvas")) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: minutes.title || "Meeting minutes", author: "MeetSync" });
  const width = 1240, height = 1754, margin = 100, bottom = 1610;
  const canvas = createCanvas(); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PDF rendering is unavailable in this browser.");
  let y = 105, page = 0;
  const font = (size, bold = false) => { ctx.font = `${bold ? "600" : "400"} ${size}px Arial, sans-serif`; ctx.fillStyle = "#30384b"; };
  const begin = () => { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height); y = 105; };
  const finish = () => {
    ctx.fillStyle = "#d7d1e6"; ctx.fillRect(margin, 1650, width - margin * 2, 1);
    font(17); ctx.fillText("MeetSync | Review before sharing", margin, 1685);
    ctx.fillText(String(page + 1), width - margin - 25, 1685);
    if (page) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, `page-${page}`, "FAST");
    page++;
  };
  const ensure = (space) => { if (y + space > bottom) { finish(); begin(); } };
  const write = (text, size = 23, bold = false, gap = 14) => {
    font(size, bold);
    const max = width - margin * 2, lineHeight = Math.ceil(size * 1.55);
    const lines = [];
    for (const paragraph of String(text || "").split("\n")) {
      let line = "";
      for (const token of paragraph.split(/(\s+)/u)) {
        if (!token) continue;
        if (ctx.measureText(line + token).width <= max) { line += token; continue; }
        if (line.trim()) { lines.push(line.trimEnd()); line = ""; }
        // Break a long URL or unspaced text without exceeding the printable area.
        for (const char of token) {
          if (ctx.measureText(line + char).width > max && line) { lines.push(line); line = ""; }
          line += char;
        }
      }
      lines.push(line.trimEnd());
    }
    for (const line of lines) { ensure(lineHeight); font(size, bold); ctx.fillText(line, margin, y + size); y += lineHeight; }
    y += gap;
  };
  const heading = (text) => { ensure(105); y += 18; write(text, 28, true, 12); };
  const section = (label, items) => {
    heading(label);
    const cleaned = (items || []).filter(s => String(s).trim());
    if (!cleaned.length) write("None recorded.");
    else cleaned.forEach((item, index) => write(`${index + 1}. ${item}`));
  };
  begin();
  write("MINUTES OF MEETING", 20, true, 20);
  write(minutes.title || "Meeting minutes", 42, true, 22);
  write(`Date: ${minutes.date || "Not specified"}`, 21);
  write(`Attendees: ${minutes.attendees || "Not specified"}`, 21);
  if (minutes.notice) write(minutes.notice, 18);
  heading("Summary"); write(minutes.summary || "None recorded.");
  section("Discussion", minutes.discussion);
  section("Decisions", minutes.decisions);
  heading("Action items");
  const actions = (minutes.actions || []).filter(a => a.task?.trim());
  if (!actions.length) write("None recorded.");
  actions.forEach((action, index) => {
    ensure(135);
    write(`${index + 1}. ${action.task}`, 23, true);
    write(`Owner: ${action.owner || "Not specified"}    |    Due: ${action.due || "Not specified"}`, 21, false, 22);
  });
  section("Next steps", minutes.next_steps);
  finish();
  return pdf;
}
