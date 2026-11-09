import { useEffect, useRef, useState } from "react";
import RecordingLanguage from "./RecordingLanguage";
import { saveRecording } from "../../lib/recordings";
import { transcribeAudio } from "../../lib/transcription";

const MP3_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/x-mpeg-3"]);

const isMp3File = (file) => {
  const hasMp3Extension = file.name.toLowerCase().endsWith(".mp3");
  const hasAllowedMimeType =
    !file.type || MP3_TYPES.has(file.type.toLowerCase());
  return hasMp3Extension && hasAllowedMimeType;
};

export default function AudioFileUpload({ user, onTranscript }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Choose an MP3 to transcribe with Whisper.");
  const [transcriptionMessage, setTranscriptionMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [transcript, setTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const fileRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    setTranscriptionMessage("");
    setTranscript("");

    if (!isMp3File(file) || file.size === 0 || file.size > 100 * 1024 * 1024) {
      setStatus("error");
      setMessage(
        "Choose a nonempty MP3 file up to 100 MB.",
      );
      fileRef.current = null;
      setFileName("");
      setPreviewUrl("");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    fileRef.current = file;
    setPreviewUrl(nextPreviewUrl);
    setFileName(file.name);
    setStatus("selected");
    setMessage("Ready to transcribe.");

    if (!user?.id) return;

    setStatus("uploading");
    setMessage("Uploading MP3 to MeetSync...");

    try {
      await saveRecording({ blob: file, durationMs: 0, userId: user.id });
      if (fileRef.current !== file) return;
      setStatus("uploaded");
      setMessage("MP3 uploaded successfully.");
    } catch (error) {
      if (fileRef.current !== file) return;
      setStatus("selected");
      setMessage(
        `MP3 ready locally. Cloud upload unavailable: ${error.message}`,
      );
    }
  };

  const handleTranscribe = async () => {
    if (!fileRef.current) return;
    setTranscribing(true);
    setTranscriptionMessage("Transcribing MP3 with Whisper…");
    try {
      const result = await transcribeAudio(
        fileRef.current,
        fileRef.current.name,
        language,
      );
      setTranscript(result.text || "");
      setTranscriptionMessage(
        result.text ? (language ? "Transcription complete." : `Transcription complete. Initial language: ${result.language}.`) : "No speech detected. Choose another recording.",
      );
    } catch (error) {
      setTranscriptionMessage(error instanceof TypeError
        ? "Cannot reach the transcription server. Start the MeetSync backend and try again."
        : `Transcription unavailable: ${error.message}`);
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
              ? "Uploading MP3"
              : status === "uploaded"
                ? "MP3 uploaded"
                : "MP3 upload"}
        </span>
      </div>
      <p
        className="audio-upload__message"
        aria-live="polite"
        role={status === "error" ? "alert" : undefined}
      >
        {transcriptionMessage || message}
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
          disabled={transcribing}
        >
          Choose MP3
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          onChange={handleFileChange}
          hidden
        />
        {fileName && <RecordingLanguage value={language} onChange={setLanguage} disabled={transcribing} />}
        <button
          type="button"
          className="audio-upload__button"
          onClick={handleTranscribe}
          disabled={!fileName || transcribing}
        >
          {transcribing ? "Transcribing…" : "Transcribe MP3"}
        </button>
      </div>
      {previewUrl && <audio className="audio-upload__audio" controls src={previewUrl} />}
      {transcript && (
        <div className="audio-upload__transcript" aria-live="polite">
          <strong>Transcript</strong>
          <p>{transcript}</p>
          <button type="button" className="mom-capture-send" onClick={() => onTranscript?.(transcript)}>Use transcript for MOM →</button>
        </div>
      )}
    </div>
  );
}
