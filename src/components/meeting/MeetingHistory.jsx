import { useEffect, useState } from "react";
import {
  getAllMeetings,
  searchMeetings,
  deleteMeeting,
  MEETING_STATUS,
} from "../../lib/meetingStore";
import "./MeetingHistory.css";

const STATUS_LABELS = {
  [MEETING_STATUS.IDLE]: "—",
  [MEETING_STATUS.RECORDING]: "Recording",
  [MEETING_STATUS.PAUSED]: "Paused",
  [MEETING_STATUS.RECORDED]: "Recorded",
  [MEETING_STATUS.TRANSCRIBING]: "Transcribing",
  [MEETING_STATUS.TRANSCRIBED]: "Transcribed",
  [MEETING_STATUS.PROCESSING]: "Processing",
  [MEETING_STATUS.COMPLETED]: "Complete",
  [MEETING_STATUS.ERROR]: "Error",
};

function formatDuration(ms) {
  if (!ms) return "—";
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

export default function MeetingHistory({ onOpen, onBack }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState(null);

  const load = async (q = "") => {
    setLoading(true);
    try {
      const results = q.trim() ? await searchMeetings(q) : await getAllMeetings();
      setMeetings(results);
      setError("");
    } catch (err) {
      setError(`Could not load meetings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSearch = (e) => {
    const q = e.target.value;
    setQuery(q);
    load(q);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this meeting and all its data?")) return;
    setDeleting(id);
    try {
      await deleteMeeting(id);
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(`Could not delete: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const totalDuration = meetings.reduce((acc, m) => acc + (m.duration_ms || 0), 0);
  const completedCount = meetings.filter((m) => m.status === MEETING_STATUS.COMPLETED).length;

  return (
    <div className="meeting-history bento-section">
      {/* ── Header ── */}
      <header className="meeting-history__header">
        <div>
          <p className="hero__launchpad-kicker">Your meetings</p>
          <h1 className="meeting-history__title">Meeting History</h1>
          <p className="meeting-history__copy">
            Review, open, or delete previous meetings stored on this device.
          </p>
        </div>
        <button
          type="button"
          className="meeting-history__back"
          onClick={onBack}
        >
          Back
        </button>
      </header>

      {/* ── Stats ── */}
      <section className="meeting-history__stats" aria-label="Summary">
        <div className="meeting-history__stat">
          <span>Meetings</span>
          <strong>{meetings.length}</strong>
        </div>
        <div className="meeting-history__stat">
          <span>With MoM</span>
          <strong>{completedCount}</strong>
        </div>
        <div className="meeting-history__stat">
          <span>Total time</span>
          <strong>{formatDuration(totalDuration)}</strong>
        </div>
        <div className="meeting-history__stat meeting-history__stat--wide">
          <span>Storage</span>
          <strong>Local (IndexedDB)</strong>
          <small>Data stays in this browser</small>
        </div>
      </section>

      {/* ── Search ── */}
      <div className="meeting-history__search-wrap">
        <input
          className="meeting-history__search"
          type="search"
          placeholder="Search meetings by title, transcript, or content…"
          value={query}
          onChange={handleSearch}
          aria-label="Search meetings"
        />
      </div>

      {/* ── Error ── */}
      {error && (
        <p className="meeting-history__error" role="alert">{error}</p>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="meeting-history__loading">
          <div className="meeting-history__spinner" />
          <span>Loading meetings…</span>
        </div>
      ) : meetings.length === 0 ? (
        <div className="meeting-history__empty">
          {query ? (
            <>
              <strong>No results for "{query}"</strong>
              <span>Try a different search term.</span>
            </>
          ) : (
            <>
              <strong>No meetings yet</strong>
              <span>Your recorded and processed meetings will appear here.</span>
            </>
          )}
        </div>
      ) : (
        <ul className="meeting-history__list" role="list">
          {meetings.map((meeting) => (
            <li
              key={meeting.id}
              className={`meeting-card ${meeting.status === MEETING_STATUS.COMPLETED ? "meeting-card--complete" : ""}`}
              onClick={() => onOpen(meeting.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(meeting.id); }}
              aria-label={`Open meeting: ${meeting.title}`}
            >
              <div className="meeting-card__main">
                <div className="meeting-card__topline">
                  <span className={`meeting-card__status meeting-card__status--${meeting.status}`}>
                    {STATUS_LABELS[meeting.status] || meeting.status}
                  </span>
                  <time className="meeting-card__date" dateTime={new Date(meeting.created_at).toISOString()}>
                    {formatDate(meeting.created_at)}
                  </time>
                </div>

                <h2 className="meeting-card__title">{meeting.title || "Untitled Meeting"}</h2>

                <div className="meeting-card__meta">
                  {meeting.duration_ms > 0 && (
                    <span>⏱ {formatDuration(meeting.duration_ms)}</span>
                  )}
                  {meeting.transcript && <span>📝 Transcript</span>}
                  {meeting.mom_data && <span>📋 MoM</span>}
                </div>

                {meeting.mom_data?.summary && (
                  <p className="meeting-card__preview">
                    {meeting.mom_data.summary.slice(0, 120)}…
                  </p>
                )}
              </div>

              <div className="meeting-card__actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="meeting-card__open"
                  onClick={() => onOpen(meeting.id)}
                  type="button"
                  aria-label="Open meeting"
                >
                  Open →
                </button>
                <button
                  className="meeting-card__delete"
                  onClick={(e) => handleDelete(meeting.id, e)}
                  disabled={deleting === meeting.id}
                  type="button"
                  aria-label="Delete meeting"
                >
                  {deleting === meeting.id ? "…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
