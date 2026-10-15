import { useEffect, useState } from "react";
import {
  deleteLocalRecording,
  getAllLocalRecordings,
} from "../../lib/localRecordings";
import "./SavedRecordings.css";

const formatDuration = (durationMs) => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const formatDate = (timestamp) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

export default function SavedRecordings({ onBack }) {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecordings = async () => {
    setLoading(true);
    try {
      setRecordings(await getAllLocalRecordings());
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Could not load saved recordings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecordings();
  }, []);

  const removeRecording = async (id) => {
    await deleteLocalRecording(id);
    setRecordings((current) =>
      current.filter((recording) => recording.id !== id),
    );
  };

  const totalDuration = recordings.reduce(
    (total, recording) => total + (recording.durationMs || 0),
    0,
  );

  return (
    <div className="saved-recordings bento-section">
      <header className="saved-recordings__header">
        <div>
          <p className="hero__launchpad-kicker">Your archive</p>
          <h1 className="saved-recordings__title">Saved recordings</h1>
          <p className="saved-recordings__copy">
            Review every recording saved on this device, listen back, or clear
            old meetings.
          </p>
        </div>
        <button
          type="button"
          className="saved-recordings__back"
          onClick={onBack}
        >
          Back to capture
        </button>
      </header>

      <section
        className="saved-recordings__summary"
        aria-label="Recording summary"
      >
        <div className="saved-recordings__stat saved-recordings__stat--wide">
          <span>Archive status</span>
          <strong>
            {loading ? "Loading" : recordings.length ? "Ready" : "Empty"}
          </strong>
          <small>Stored locally in this browser</small>
        </div>
        <div className="saved-recordings__stat">
          <span>Recordings</span>
          <strong>{recordings.length}</strong>
        </div>
        <div className="saved-recordings__stat">
          <span>Total time</span>
          <strong>{formatDuration(totalDuration)}</strong>
        </div>
      </section>

      {error && (
        <p className="saved-recordings__error" role="alert">
          {error}
        </p>
      )}
      {!loading && !recordings.length && (
        <div className="saved-recordings__empty">
          <strong>No recordings yet</strong>
          <span>Your next recording will appear here automatically.</span>
        </div>
      )}
      <section
        className="saved-recordings__grid"
        aria-label="Saved recordings list"
      >
        {recordings.map((recording, index) => (
          <SavedRecordingCard
            key={recording.id}
            recording={recording}
            index={index}
            total={recordings.length}
            onDelete={removeRecording}
          />
        ))}
      </section>
    </div>
  );
}

function SavedRecordingCard({ recording, index, total, onDelete }) {
  const [playbackUrl, setPlaybackUrl] = useState("");

  useEffect(() => {
    if (!recording.blob || !(recording.blob instanceof Blob)) {
      setPlaybackUrl("");
      return;
    }
    const url = URL.createObjectURL(recording.blob);
    setPlaybackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recording.blob]);

  return (
    <article
      className={`saved-recording-card ${index === 0 ? "saved-recording-card--featured" : ""}`}
    >
      <div className="saved-recording-card__topline">
        <span>
          {index === 0 ? "Latest capture" : `Recording ${total - index}`}
        </span>
        <time dateTime={new Date(recording.createdAt).toISOString()}>
          {formatDate(recording.createdAt)}
        </time>
      </div>
      <h2>{index === 0 ? "Meeting capture" : "Saved meeting"}</h2>
      <p>
        {formatDuration(recording.durationMs || 0)} of audio stored locally.
      </p>
      {playbackUrl && <audio controls preload="metadata" src={playbackUrl} />}
      <button
        type="button"
        className="saved-recording-card__delete"
        onClick={() => onDelete(recording.id)}
      >
        Delete recording
      </button>
    </article>
  );
}
