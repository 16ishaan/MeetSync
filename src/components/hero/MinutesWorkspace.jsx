import { forwardRef, useImperativeHandle, useState } from "react";
import { generateMinutes, downloadMinutesPdf } from "../../lib/minutes";
import "./MinutesWorkspace.css";

const today = () => new Date().toLocaleDateString("en-CA");
const emptyMeeting = () => ({ title: "", date: today(), attendees: "", transcript: "" });
const demo = "Ishaan: We reviewed the MeetSync release. The team agreed to keep Google sign-in. Siddhant will test the recording flow before Friday. Ishaan will prepare the demo slides. The PDF export was approved for this release. We need to confirm the deployment date. The next meeting is on Monday to review test results.";

const MinutesWorkspace = forwardRef(function MinutesWorkspace({ user }, ref) {
  const [meeting, setMeeting] = useState(emptyMeeting);
  const [minutes, setMinutes] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const storageKey = `meetsync-mom-v1-${user?.id || "guest"}`;
  useImperativeHandle(ref, () => ({
    importTranscript(text) {
      if (!text?.trim()) return;
      if ((meeting.transcript || minutes) && !window.confirm("Replace the current transcript and draft with this capture? Save your current draft first if needed.")) return;
      setMeeting(current => ({ ...current, transcript: text }));
      setMinutes(null); setDirty(false); setMessage("Transcript added. Enter meeting details, then generate your MOM."); setError("");
      document.getElementById("minutes-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }), [meeting.transcript, minutes]);

  const changeMeeting = (field, value) => { setMeeting(current => ({ ...current, [field]: value })); if (minutes) setDirty(true); };
  const changeMinutes = (field, value) => setMinutes(current => ({ ...current, [field]: value }));
  const generate = async () => {
    if (minutes && !window.confirm("Generate a new draft? This replaces your edited minutes.")) return;
    setBusy("generate"); setError(""); setMessage("");
    try {
      setMinutes(await generateMinutes({ ...meeting, title: meeting.title || "Meeting minutes" }));
      setDirty(false); setMessage("Draft ready. Review the sections below before exporting.");
    } catch (err) { setError(err.message); }
    finally { setBusy(""); }
  };
  const download = async () => {
    setBusy("pdf"); setError("");
    const exportData = { ...minutes, discussion: minutes.discussion.filter(s => s.trim()), decisions: minutes.decisions.filter(s => s.trim()), next_steps: minutes.next_steps.filter(s => s.trim()), actions: minutes.actions.filter(a => a.task.trim()) };
    try { await downloadMinutesPdf(exportData); setMessage("PDF downloaded with your latest edits."); }
    catch (err) { setError(err.message); }
    finally { setBusy(""); }
  };
  const save = () => {
    try { localStorage.setItem(storageKey, JSON.stringify({ meeting, minutes, dirty })); setMessage("Draft saved in this browser. It is not synced to the cloud."); }
    catch { setError("Browser storage is full or disabled. Download your PDF to keep a copy."); }
  };
  const restore = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) { setMessage("No saved draft in this browser."); return; }
      const saved = JSON.parse(raw);
      if (!saved.meeting || typeof saved.meeting.transcript !== "string" || (saved.minutes && !Array.isArray(saved.minutes.actions))) throw new Error();
      if ((meeting.transcript || minutes) && !window.confirm("Replace your current work with the saved browser draft?")) return;
      setMeeting(saved.meeting); setMinutes(saved.minutes); setDirty(Boolean(saved.dirty)); setMessage("Browser draft restored."); setError("");
    } catch { setError("This saved draft cannot be restored."); }
  };
  const listEditor = (field, label) => <label className="mom-field" key={field}>{label}<textarea disabled={Boolean(busy)} value={minutes[field].join("\n")} onChange={event => changeMinutes(field, event.target.value.split("\n"))} maxLength={12000} rows={4} placeholder="One item per line. Leave empty if none recorded." /></label>;

  return (
    <section className="mom-workspace" id="minutes-workspace" aria-labelledby="mom-heading">
      <header className="mom-heading"><div><p className="mom-kicker">THE MEETING, MADE CLEAR</p><h2 id="mom-heading">From conversation<br/><em>to a plan of action.</em></h2></div><p>Capture above or paste a transcript below. Turn it into editable minutes, then take the PDF with you.</p></header>
      <div className="mom-steps" aria-label="Workflow"><span>01 / Add your meeting</span><span>02 / Review the minutes</span><span>03 / Download PDF</span></div>
      {message && <p className="mom-feedback" role="status">{message}</p>}
      {error && <p className="mom-error" role="alert">{error}</p>}
      <div className="mom-editor-grid">
        <div className="mom-panel">
          <div className="mom-panel-title"><h3>Meeting source</h3><span>01</span></div>
          <div className="mom-meta">
            <label className="mom-field">Meeting title<input maxLength={200} disabled={Boolean(busy)} value={meeting.title} onChange={e => changeMeeting("title", e.target.value)} placeholder="e.g. Product weekly sync" /></label>
            <label className="mom-field">Meeting date<input type="date" disabled={Boolean(busy)} value={meeting.date} onChange={e => changeMeeting("date", e.target.value)} /></label>
          </div>
          <label className="mom-field">Attendees<input maxLength={2000} disabled={Boolean(busy)} value={meeting.attendees} onChange={e => changeMeeting("attendees", e.target.value)} placeholder="Names, separated by commas" /></label>
          <label className="mom-field">Transcript<textarea className="mom-source" maxLength={60000} disabled={Boolean(busy)} value={meeting.transcript} onChange={e => changeMeeting("transcript", e.target.value)} placeholder="Paste meeting notes or send a transcript from any capture tool above…" rows={13} /></label>
          <p className="mom-muted">{meeting.transcript.length.toLocaleString()} / 60,000 characters · Minimum 20</p>
          <div className="mom-toolbar"><button className="mom-primary" disabled={Boolean(busy) || meeting.transcript.trim().length < 20} onClick={generate}>{busy === "generate" ? "Preparing your minutes…" : minutes ? "Regenerate MOM" : "Generate MOM"}</button><button disabled={Boolean(busy)} onClick={() => { if (meeting.transcript && !window.confirm("Replace the transcript with a sample meeting?")) return; setMeeting({ title: "MeetSync release planning", date: today(), attendees: "Ishaan, Siddhant", transcript: demo }); setMinutes(null); setDirty(false); setMessage("Sample loaded. Generate MOM to try the full workflow."); }}>Try sample</button></div>
          <div className="mom-toolbar"><button disabled={Boolean(busy)} onClick={save}>Save browser draft</button><button disabled={Boolean(busy)} onClick={restore}>Restore draft</button><button disabled={Boolean(busy)} onClick={() => { if (!window.confirm("Clear this meeting and delete its saved browser draft?")) return; localStorage.removeItem(storageKey); setMeeting(emptyMeeting()); setMinutes(null); setDirty(false); setMessage("Meeting cleared."); }}>New meeting</button></div>
          <p className="mom-muted">Audio transcription and MOM generation use your configured backend. Saved drafts stay in this browser.</p>
        </div>
        <div className="mom-panel mom-result" aria-busy={Boolean(busy)}>
          <div className="mom-panel-title"><h3>Minutes of meeting</h3><span>02</span></div>
          {!minutes ? <div className="mom-empty"><span className="mom-empty-icon" aria-hidden="true">✦</span><h3>A little less admin.<br/>A lot more clarity.</h3><p>Your summary, decisions, and action items will appear here. Every section stays editable.</p><div className="mom-empty-tags"><span>Summary</span><span>Decisions</span><span>Who does what</span></div></div> : <>
            <p className="mom-badge">{minutes.method === "local-ai" ? "LOCAL AI DRAFT" : "EXTRACTIVE DRAFT"} · REVIEW REQUIRED</p>
            <p className="mom-muted">{minutes.notice}</p>
            {dirty && <p role="status" className="mom-warning">Source details changed. Regenerate to use the new transcript; PDF exports the draft shown below.</p>}
            <div className="mom-meta"><label className="mom-field">MOM title<input disabled={Boolean(busy)} maxLength={200} value={minutes.title} onChange={e => changeMinutes("title", e.target.value)} /></label><label className="mom-field">MOM date<input disabled={Boolean(busy)} type="date" value={minutes.date} onChange={e => changeMinutes("date", e.target.value)} /></label></div>
            <label className="mom-field">Attendees<input disabled={Boolean(busy)} maxLength={2000} value={minutes.attendees} onChange={e => changeMinutes("attendees", e.target.value)} /></label>
            <label className="mom-field">Summary<textarea disabled={Boolean(busy)} maxLength={12000} rows={4} value={minutes.summary} onChange={e => changeMinutes("summary", e.target.value)} /></label>
            {listEditor("discussion", "Discussion points")}{listEditor("decisions", "Decisions")}
            <div className="mom-action-heading"><h4>Action items</h4><button disabled={Boolean(busy) || minutes.actions.length >= 50} onClick={() => changeMinutes("actions", [...minutes.actions, { task: "", owner: "", due: "" }])}>+ Add action</button></div>
            {!minutes.actions.length && <p className="mom-muted">No action items recorded. Add any agreed tasks after reviewing the transcript.</p>}
            {minutes.actions.map((action, index) => <div className="mom-action" key={index}><label className="mom-field">Task {index+1}<textarea rows={2} maxLength={2000} disabled={Boolean(busy)} value={action.task} onChange={e => changeMinutes("actions", minutes.actions.map((a,i) => i === index ? { ...a, task: e.target.value } : a))}/></label><div className="mom-meta">{["owner", "due"].map(field => <label className="mom-field" key={field}>{field === "owner" ? "Owner" : "Due date / deadline"}<input disabled={Boolean(busy)} maxLength={200} value={action[field]} onChange={e => changeMinutes("actions", minutes.actions.map((a,i) => i === index ? { ...a, [field]: e.target.value } : a))}/></label>)}</div><button disabled={Boolean(busy)} onClick={() => changeMinutes("actions", minutes.actions.filter((_,i) => i !== index))}>Remove action {index+1}</button></div>)}
            {listEditor("next_steps", "Next steps / next meeting")}
            <button className="mom-primary mom-download" disabled={Boolean(busy)} onClick={download}>{busy === "pdf" ? "Preparing PDF…" : "Download MOM as PDF ↓"}</button>
          </>}
        </div>
      </div>
    </section>
  );
});
export default MinutesWorkspace;
