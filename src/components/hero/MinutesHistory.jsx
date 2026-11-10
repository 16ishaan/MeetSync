import { useEffect, useRef, useState } from "react";
import { readMinutesHistory } from "../../lib/minutesHistory";
import { downloadMinutesPdf } from "../../lib/minutes";

export default function MinutesHistory({ userId, onClose }) {
  const dialog = useRef(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    try { setEntries(readMinutesHistory(userId)); }
    catch { setError("Could not read the meeting history from this browser."); }
    return () => node.close();
  }, [userId]);

  async function download(entry) {
    setExporting(entry.id);
    setError("");
    try { await downloadMinutesPdf(entry.minutes); }
    catch { setError("Could not create the PDF. Please try again."); }
    finally { setExporting(""); }
  }

  return (
    <dialog className="mom-history mom-workspace" ref={dialog} aria-labelledby="history-title"
      onCancel={onClose}>
      <header><h2 id="history-title">Previous MOMs</h2><button onClick={onClose}>Close</button></header>
      <p className="mom-muted">Meeting summaries saved in this browser.</p>
      {error && <p role="alert">{error}</p>}
      {!error && !entries.length && <p>Generate a MOM to add your first summary.</p>}
      {entries.map(entry => (
        <article key={entry.id}>
          <h3>{entry.minutes.title || "Meeting minutes"}</h3>
          {entry.minutes.date && <time dateTime={entry.minutes.date}>{entry.minutes.date}</time>}
          <p>{entry.minutes.summary || "No summary recorded."}</p>
          <button onClick={() => download(entry)} disabled={Boolean(exporting)}>
            {exporting === entry.id ? "Preparing PDF…" : "Download MOM as PDF"}
          </button>
        </article>
      ))}
    </dialog>
  );
}
