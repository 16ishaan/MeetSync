import { useEffect, useRef, useState } from "react";
import {
  getMeeting,
  updateMeeting,
  getActionItemsForMeeting,
  updateActionItem,
  deleteActionItem,
  saveActionItemsFromMom,
  createActionItem,
  MEETING_STATUS,
  ACTION_STATUS,
} from "../../lib/meetingStore";
import { generateMoM, checkBackendHealth } from "../../lib/momService";
import { exportMeetingPDF } from "../../lib/pdfExport";
import "./MeetingView.css";

const PRIORITY_COLORS = {
  high: "#dc5046",
  medium: "#9870dc",
  low: "#4da87e",
};

function formatDuration(ms) {
  if (!ms) return "--:--";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(ts));
}

// ─── TAB NAVIGATION ───────────────────────────────────────────────────────────

const TABS = [
  { id: "transcript", label: "Transcript" },
  { id: "mom", label: "Minutes of Meeting" },
  { id: "actions", label: "Action Items" },
];

// ─── MAIN MEETING VIEW ────────────────────────────────────────────────────────

export default function MeetingView({ meetingId, onBack }) {
  const [meeting, setMeeting] = useState(null);
  const [actionItems, setActionItems] = useState([]);
  const [activeTab, setActiveTab] = useState("transcript");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [backendHealth, setBackendHealth] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef(null);

  // Load meeting + action items
  const loadMeeting = async () => {
    try {
      const m = await getMeeting(meetingId);
      if (!m) {
        setError("Meeting not found.");
        return;
      }
      setMeeting(m);
      setTitleDraft(m.title || "");
      const items = await getActionItemsForMeeting(meetingId);
      setActionItems(items);
      setError("");
    } catch (err) {
      setError(`Could not load meeting: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!meetingId) return;
    setLoading(true);
    loadMeeting();
    checkBackendHealth().then(setBackendHealth);
  }, [meetingId]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitle]);

  const saveTitle = async () => {
    if (!titleDraft.trim() || titleDraft === meeting?.title) {
      setEditingTitle(false);
      return;
    }
    await updateMeeting(meetingId, { title: titleDraft.trim() });
    setMeeting((prev) => ({ ...prev, title: titleDraft.trim() }));
    setEditingTitle(false);
  };

  const handleGenerateMoM = async () => {
    if (!meeting?.transcript) {
      setError("A transcript is required to generate Minutes of Meeting.");
      return;
    }
    if (processing) return;

    setProcessing(true);
    setError("");
    setProcessingStatus("Sending transcript to AI...");

    try {
      await updateMeeting(meetingId, { status: MEETING_STATUS.PROCESSING, processing_status: "running" });
      setMeeting((prev) => ({ ...prev, status: MEETING_STATUS.PROCESSING }));

      const momData = await generateMoM({
        transcript: meeting.transcript,
        meetingTitle: meeting.title,
        duration_ms: meeting.duration_ms,
      });

      setProcessingStatus("Saving Minutes of Meeting...");

      const updatedMeeting = await updateMeeting(meetingId, {
        mom_data: momData,
        status: MEETING_STATUS.COMPLETED,
        processing_status: "completed",
      });
      setMeeting(updatedMeeting);

      // Save action items
      if (momData.action_items?.length) {
        setProcessingStatus("Extracting action items...");
        const newItems = await saveActionItemsFromMom(meetingId, momData.action_items);
        setActionItems((prev) => [...prev, ...newItems]);
      }

      setActiveTab("mom");
      setProcessingStatus("");
    } catch (err) {
      setError(`MoM generation failed: ${err.message}`);
      await updateMeeting(meetingId, {
        status: MEETING_STATUS.TRANSCRIBED,
        processing_status: "error",
      });
      setMeeting((prev) => ({ ...prev, status: MEETING_STATUS.TRANSCRIBED, processing_status: "error" }));
    } finally {
      setProcessing(false);
      setProcessingStatus("");
    }
  };

  const handleExportPDF = () => {
    if (!meeting) return;
    try {
      exportMeetingPDF(meeting);
    } catch (err) {
      setError(`PDF export failed: ${err.message}`);
    }
  };

  const toggleActionItem = async (item) => {
    const newStatus = item.status === ACTION_STATUS.COMPLETED ? ACTION_STATUS.OPEN : ACTION_STATUS.COMPLETED;
    const updated = await updateActionItem(item.id, { status: newStatus });
    setActionItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const removeActionItem = async (itemId) => {
    await deleteActionItem(itemId);
    setActionItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  if (loading) {
    return (
      <div className="meeting-view meeting-view--loading">
        <div className="meeting-view__spinner" />
        <p>Loading meeting…</p>
      </div>
    );
  }

  if (error && !meeting) {
    return (
      <div className="meeting-view meeting-view--error">
        <p role="alert">{error}</p>
        <button className="mv-btn mv-btn--ghost" onClick={onBack}>← Back</button>
      </div>
    );
  }

  const hasMoM = !!meeting?.mom_data;
  const hasTranscript = !!meeting?.transcript;
  const isCompleted = meeting?.status === MEETING_STATUS.COMPLETED;
  const canGenerateMoM = hasTranscript && !processing;

  return (
    <div className="meeting-view">
      {/* ── Header ── */}
      <header className="meeting-view__header">
        <button className="mv-btn mv-btn--ghost mv-btn--back" onClick={onBack} type="button">
          ← Back
        </button>

        <div className="meeting-view__meta">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="meeting-view__title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
            />
          ) : (
            <h1 className="meeting-view__title" onClick={() => setEditingTitle(true)} title="Click to edit">
              {meeting?.title || "Untitled Meeting"}
              <span className="meeting-view__edit-hint" aria-hidden="true"> ✎</span>
            </h1>
          )}

          <div className="meeting-view__submeta">
            <span>{formatDate(meeting?.started_at)}</span>
            {meeting?.duration_ms > 0 && (
              <span>· {formatDuration(meeting.duration_ms)}</span>
            )}
            <span className={`meeting-view__status meeting-view__status--${meeting?.status}`}>
              {meeting?.status?.replace(/-/g, " ")}
            </span>
          </div>
        </div>

        <div className="meeting-view__header-actions">
          {canGenerateMoM && (
            <button
              className="mv-btn mv-btn--primary"
              onClick={handleGenerateMoM}
              disabled={processing}
              type="button"
            >
              {processing ? processingStatus || "Processing…" : hasMoM ? "Regenerate MoM" : "Generate MoM"}
            </button>
          )}
          {hasMoM && (
            <button className="mv-btn mv-btn--secondary" onClick={handleExportPDF} type="button">
              Export PDF
            </button>
          )}
        </div>
      </header>

      {/* ── Backend health warning ── */}
      {backendHealth && !backendHealth.healthy && (
        <div className="meeting-view__banner meeting-view__banner--warn" role="alert">
          ⚠ Transcription service unreachable ({backendHealth.reason}). Start the backend with{" "}
          <code>uvicorn transcription_server:app</code>.
        </div>
      )}
      {backendHealth?.healthy && !backendHealth.ai_configured && (
        <div className="meeting-view__banner meeting-view__banner--info" role="status">
          ℹ AI provider not configured. Set <code>AI_API_KEY</code> in the backend environment to enable MoM generation.
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="meeting-view__banner meeting-view__banner--error" role="alert">
          {error}
          <button className="mv-btn mv-btn--ghost" style={{ marginLeft: "auto" }} onClick={() => setError("")}>✕</button>
        </div>
      )}

      {/* ── Processing overlay ── */}
      {processing && (
        <div className="meeting-view__processing" role="status" aria-live="polite">
          <div className="meeting-view__spinner" />
          <span>{processingStatus || "Processing…"}</span>
        </div>
      )}

      {/* ── Tabs ── */}
      <nav className="meeting-view__tabs" aria-label="Meeting sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`meeting-view__tab ${activeTab === tab.id ? "meeting-view__tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
            {tab.id === "actions" && actionItems.length > 0 && (
              <span className="meeting-view__tab-badge">{actionItems.filter((i) => i.status !== ACTION_STATUS.COMPLETED).length}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Tab content ── */}
      <div className="meeting-view__content">
        {activeTab === "transcript" && (
          <TranscriptTab meeting={meeting} />
        )}
        {activeTab === "mom" && (
          <MoMTab meeting={meeting} onGenerateMoM={handleGenerateMoM} processing={processing} />
        )}
        {activeTab === "actions" && (
          <ActionItemsTab
            meetingId={meetingId}
            items={actionItems}
            onToggle={toggleActionItem}
            onDelete={removeActionItem}
            onAdd={async (item) => {
              const newItem = await createActionItem({ meetingId, ...item });
              setActionItems((prev) => [...prev, newItem]);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── TRANSCRIPT TAB ───────────────────────────────────────────────────────────

function TranscriptTab({ meeting }) {
  if (!meeting?.transcript) {
    return (
      <div className="mv-empty">
        <p className="mv-empty__title">No transcript yet</p>
        <p className="mv-empty__desc">
          Use the Transcribe button after recording, or upload an audio file to generate a transcript.
          Alternatively, use the Web Speech card for live in-browser transcription.
        </p>
      </div>
    );
  }

  const isWebSpeech = meeting.transcription_status === "web-speech";
  const source = isWebSpeech
    ? "Web Speech API (browser built-in)"
    : "Whisper (local transcription server)";
  const statusLabel =
    meeting.transcription_status === "completed" || isWebSpeech
      ? " · Complete"
      : meeting.transcription_status === "error"
      ? " · Error"
      : "";

  return (
    <div className="mv-transcript">
      <div className="mv-transcript__text">{meeting.transcript}</div>
      <p className="mv-transcript__note">
        Source: {source}{statusLabel}
      </p>
    </div>
  );
}


// ─── MOM TAB ─────────────────────────────────────────────────────────────────

function MoMTab({ meeting, onGenerateMoM, processing }) {
  const mom = meeting?.mom_data;

  if (!meeting?.transcript) {
    return (
      <div className="mv-empty">
        <p className="mv-empty__title">Transcript required</p>
        <p className="mv-empty__desc">Generate a transcript first, then you can create Minutes of Meeting.</p>
      </div>
    );
  }

  if (!mom) {
    return (
      <div className="mv-empty">
        <p className="mv-empty__title">No Minutes of Meeting yet</p>
        <p className="mv-empty__desc">
          Click <strong>Generate MoM</strong> to create structured meeting minutes from the transcript.
        </p>
        <button className="mv-btn mv-btn--primary" onClick={onGenerateMoM} disabled={processing} type="button">
          {processing ? "Processing…" : "Generate MoM"}
        </button>
      </div>
    );
  }

  return (
    <div className="mv-mom">
      {mom.summary && (
        <section className="mv-mom__section">
          <h2 className="mv-mom__section-title">Executive Summary</h2>
          <p className="mv-mom__body">{mom.summary}</p>
        </section>
      )}

      {mom.overview && (
        <section className="mv-mom__section">
          <h2 className="mv-mom__section-title">Overview</h2>
          <p className="mv-mom__body">{mom.overview}</p>
        </section>
      )}

      {(mom.discussion_points || mom.main_discussion_points || []).length > 0 && (
        <section className="mv-mom__section">
          <h2 className="mv-mom__section-title">Discussion Points</h2>
          <ul className="mv-mom__list">
            {(mom.discussion_points || mom.main_discussion_points).map((pt, i) => (
              <li key={i} className="mv-mom__list-item">
                {typeof pt === "string" ? pt : pt.point || pt.text || JSON.stringify(pt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(mom.decisions || mom.important_decisions || []).length > 0 && (
        <section className="mv-mom__section">
          <h2 className="mv-mom__section-title">Decisions Made</h2>
          <ul className="mv-mom__list mv-mom__list--decisions">
            {(mom.decisions || mom.important_decisions).map((d, i) => (
              <li key={i} className="mv-mom__list-item mv-mom__list-item--decision">
                {typeof d === "string" ? d : d.decision || d.text || JSON.stringify(d)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(mom.action_items || []).length > 0 && (
        <section className="mv-mom__section">
          <h2 className="mv-mom__section-title">Action Items</h2>
          <div className="mv-mom__action-grid">
            {mom.action_items.map((item, i) => (
              <div key={i} className="mv-mom__action-card">
                <div className="mv-mom__action-header">
                  <span
                    className="mv-mom__action-priority"
                    style={{ background: PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium }}
                  >
                    {item.priority || "medium"}
                  </span>
                  <strong className="mv-mom__action-title">{item.title || item.task}</strong>
                </div>
                <div className="mv-mom__action-meta">
                  <span>👤 {item.assignee || "Unassigned"}</span>
                  <span>📅 {item.deadline || "Unspecified"}</span>
                </div>
                {item.description && <p className="mv-mom__action-desc">{item.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(mom.unresolved_questions || mom.open_questions || []).length > 0 && (
        <section className="mv-mom__section">
          <h2 className="mv-mom__section-title">Unresolved Questions</h2>
          <ul className="mv-mom__list mv-mom__list--questions">
            {(mom.unresolved_questions || mom.open_questions).map((q, i) => (
              <li key={i} className="mv-mom__list-item">
                {typeof q === "string" ? q : q.question || JSON.stringify(q)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── ACTION ITEMS TAB ─────────────────────────────────────────────────────────

function ActionItemsTab({ meetingId, items, onToggle, onDelete, onAdd }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all"); // all | open | completed
  const [form, setForm] = useState({ title: "", assignee: "", deadline: "", priority: "medium", description: "" });
  const [adding, setAdding] = useState(false);

  const filtered = items.filter((item) => {
    if (filter === "open") return item.status === ACTION_STATUS.OPEN;
    if (filter === "completed") return item.status === ACTION_STATUS.COMPLETED;
    return true;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setAdding(true);
    try {
      await onAdd({
        title: form.title.trim(),
        assignee: form.assignee.trim() || "Unassigned",
        deadline: form.deadline || null,
        priority: form.priority,
        description: form.description.trim(),
      });
      setForm({ title: "", assignee: "", deadline: "", priority: "medium", description: "" });
      setShowForm(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mv-actions">
      <div className="mv-actions__toolbar">
        <div className="mv-actions__filters">
          {["all", "open", "completed"].map((f) => (
            <button
              key={f}
              className={`mv-actions__filter ${filter === f ? "mv-actions__filter--active" : ""}`}
              onClick={() => setFilter(f)}
              type="button"
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="mv-btn mv-btn--secondary"
          onClick={() => setShowForm((v) => !v)}
          type="button"
        >
          {showForm ? "Cancel" : "+ Add task"}
        </button>
      </div>

      {showForm && (
        <form className="mv-actions__form" onSubmit={handleSubmit}>
          <input
            className="mv-actions__input"
            placeholder="Task title *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <div className="mv-actions__form-row">
            <input
              className="mv-actions__input"
              placeholder="Assignee"
              value={form.assignee}
              onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
            />
            <input
              className="mv-actions__input"
              type="date"
              value={form.deadline}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
            />
            <select
              className="mv-actions__input mv-actions__select"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <textarea
            className="mv-actions__input mv-actions__textarea"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
          <button className="mv-btn mv-btn--primary" type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add task"}
          </button>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="mv-empty">
          <p className="mv-empty__title">No {filter === "all" ? "" : filter} action items</p>
          <p className="mv-empty__desc">
            {filter === "all"
              ? "Generate a MoM to extract action items automatically, or add them manually."
              : `No ${filter} tasks.`}
          </p>
        </div>
      ) : (
        <ul className="mv-actions__list" role="list">
          {filtered.map((item) => (
            <li key={item.id} className={`mv-action-card ${item.status === ACTION_STATUS.COMPLETED ? "mv-action-card--done" : ""}`}>
              <button
                className="mv-action-card__check"
                onClick={() => onToggle(item)}
                type="button"
                aria-label={item.status === ACTION_STATUS.COMPLETED ? "Reopen task" : "Mark complete"}
              >
                {item.status === ACTION_STATUS.COMPLETED ? "✓" : "○"}
              </button>

              <div className="mv-action-card__body">
                <div className="mv-action-card__header">
                  <span
                    className="mv-action-card__priority"
                    style={{ background: PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium }}
                  >
                    {item.priority}
                  </span>
                  <strong className="mv-action-card__title">{item.title}</strong>
                </div>

                {item.description && (
                  <p className="mv-action-card__desc">{item.description}</p>
                )}

                <div className="mv-action-card__meta">
                  <span>👤 {item.assignee || "Unassigned"}</span>
                  {item.deadline && <span>📅 {item.deadline}</span>}
                </div>
              </div>

              <button
                className="mv-action-card__delete"
                onClick={() => onDelete(item.id)}
                type="button"
                aria-label="Delete task"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mv-actions__summary">
        {items.filter((i) => i.status === ACTION_STATUS.OPEN).length} open ·{" "}
        {items.filter((i) => i.status === ACTION_STATUS.COMPLETED).length} completed
      </div>
    </div>
  );
}
