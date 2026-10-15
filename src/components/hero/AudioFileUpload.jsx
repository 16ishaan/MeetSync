import { useEffect, useRef, useState } from "react";
import { saveRecording } from "../../lib/recordings";
import { transcribeAudio } from "../../lib/transcription";
import { createMeeting, updateMeeting, MEETING_STATUS } from "../../lib/meetingStore";

const MP3_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/x-mpeg-3"]);
const AUDIO_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/x-mpeg-3",
  "audio/wav", "audio/wave", "audio/x-wav",
  "audio/webm", "audio/ogg", "audio/mp4",
]);

const isAudioFile = (file) => {
  const name = file.name.toLowerCase();
  const hasAudioExt = [".mp3", ".wav", ".webm", ".ogg", ".m4a", ".mp4"].some((e) => name.endsWith(e));
  const hasAudioMime = !file.type || AUDIO_TYPES.has(file.type.toLowerCase()) || file.type.startsWith("audio/");
  return hasAudioExt && hasAudioMime;
};

export default function AudioFileUpload({ user, onMeetingReady }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Upload an audio file (MP3, WAV, WebM, OGG).");
  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!isAudioFile(file)) {
      setStatus("error");
      setMessage("Only audio files are supported (MP3, WAV, WebM, OGG, M4A).");
      setFileName("");
      setPreviewUrl("");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    fileRef.current = file;
    setPreviewUrl(nextPreviewUrl);
    setFileName(file.name);
    setStatus("selected");
    setMessage("Audio file accepted. Click 'Transcribe' to process.");
    setTranscript("");

    // Create a meeting record for this upload
    let meetingId = null;
    try {
      const baseName = file.name.replace(/\.[^.]+$/, "") || "Uploaded meeting";
      const newMeeting = await createMeeting({ title: baseName });
      meetingId = newMeeting.id;
      setCurrentMeetingId(meetingId);
      await updateMeeting(meetingId, {
        status: MEETING_STATUS.RECORDED,
        started_at: Date.now(),
      });
    } catch { /* non-fatal */ }

    if (!user?.id) return;

    setStatus("uploading");
    setMessage("Uploading to MeetSync...");

    try {
      await saveRecording({ blob: file, durationMs: 0, userId: user.id });
      setStatus("uploaded");
      setMessage("Audio uploaded. Click 'Transcribe' to process.");
    } catch (err) {
      setStatus("selected");
      setMessage(`Audio ready locally. Cloud upload unavailable: ${err.message}`);
    }
  };

  const handleTranscribe = async () => {
    if (!fileRef.current) return;
    setTranscribing(true);
    setMessage("Transcribing with Whisper...");
    if (currentMeetingId) {
      updateMeeting(currentMeetingId, { status: MEETING_STATUS.TRANSCRIBING }).catch(() => {});
    }
    try {
      const result = await transcribeAudio(fileRef.current, fileRef.current.name);
      const text = result.text || "No speech was detected.";
      setTranscript(text);
      setMessage(`Transcription complete. Detected language: ${result.language}.`);

      let meetingId = currentMeetingId;
      if (!meetingId) {
        try {
          const baseName = fileRef.current.name.replace(/\.[^.]+$/, "") || "Uploaded meeting";
          const newMeeting = await createMeeting({ title: baseName });
          meetingId = newMeeting.id;
          setCurrentMeetingId(meetingId);
        } catch { /* fallback */ }
      }

      if (meetingId) {
        await updateMeeting(meetingId, {
          transcript: text,
          transcription_status: "completed",
          status: MEETING_STATUS.TRANSCRIBED,
        });
        if (onMeetingReady) {
          onMeetingReady({ meetingId, blob: fileRef.current, transcript: text });
        }
      }
    } catch (err) {
      setMessage(`Transcription unavailable: ${err.message}`);
      if (currentMeetingId) {
        updateMeeting(currentMeetingId, { transcription_status: "error" }).catch(() => {});
      }
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className={`audio-upload audio-upload--${status}`}>
      <div className="audio-upload__signal" aria-live="polite">
        <span className="audio-upload__signal-dot" aria-hidden="true" />
        <span>
          {status === "error"
            ? "Invalid file"
            : status === "uploading"
              ? "Uploading audio"
              : status === "uploaded"
                ? "Audio uploaded"
                : status === "selected"
                  ? "File ready"
                  : "Audio upload"}
        </span>
      </div>

      <p
        className="audio-upload__message"
        role={status === "error" ? "alert" : undefined}
      >
        {message}
      </p>

      {fileName && (
        <p className="audio-upload__filename" title={fileName}>
          {fileName}
        </p>
      )}

      <div className="audio-upload__actions">
        <button
          type="button"
          className="audio-upload__button"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,.webm,.ogg,.m4a,.mp4,audio/*"
          onChange={handleFileChange}
          hidden
        />

        {previewUrl && (
          <audio className="audio-upload__audio" controls src={previewUrl} />
        )}

        {previewUrl && !transcript && (
          <button
            type="button"
            className="audio-upload__button"
            onClick={handleTranscribe}
            disabled={transcribing}
          >
            {transcribing ? "Transcribing…" : "Transcribe"}
          </button>
        )}

        {/* Open in meeting view after transcription */}
        {currentMeetingId && transcript && onMeetingReady && (
          <button
            type="button"
            className="audio-upload__button"
            style={{ borderColor: "rgba(110, 91, 255, 0.6)", color: "#a79bff" }}
            onClick={() => onMeetingReady({ meetingId: currentMeetingId, blob: fileRef.current, transcript })}
          >
            Open meeting →
          </button>
        )}
      </div>

      {transcript && (
        <div className="audio-upload__transcript" aria-live="polite">
          <strong>Transcript</strong>
          <p>{transcript}</p>
        </div>
      )}
    </div>
  );
}
