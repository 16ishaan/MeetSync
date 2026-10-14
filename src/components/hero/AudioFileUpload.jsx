import { useEffect, useRef, useState } from "react";
import { saveRecording } from "../../lib/recordings";
import { transcribeAudio } from "../../lib/transcription";

const MP3_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/x-mpeg-3"]);

const isMp3File = (file) => {
  const hasMp3Extension = file.name.toLowerCase().endsWith(".mp3");
  const hasAllowedMimeType =
    !file.type || MP3_TYPES.has(file.type.toLowerCase());
  return hasMp3Extension && hasAllowedMimeType;
};

export default function AudioFileUpload({ user }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("MP3 files only.");
  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
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

    if (!isMp3File(file)) {
      setStatus("error");
      setMessage(
        "Only .mp3 audio files are allowed. Please choose an MP3 file.",
      );
      setFileName("");
      setPreviewUrl("");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    fileRef.current = file;
    setPreviewUrl(nextPreviewUrl);
    setFileName(file.name);
    setStatus("selected");
    setMessage("MP3 accepted. Ready to upload.");

    if (!user?.id) return;

    setStatus("uploading");
    setMessage("Uploading MP3 to MeetSync...");

    try {
      await saveRecording({ blob: file, durationMs: 0, userId: user.id });
      setStatus("uploaded");
      setMessage("MP3 uploaded successfully.");
    } catch (error) {
      setStatus("selected");
      setMessage(
        `MP3 ready locally. Cloud upload unavailable: ${error.message}`,
      );
    }
  };

  const handleTranscribe = async () => {
    if (!fileRef.current) return;
    setTranscribing(true);
    setMessage("Transcribing MP3 with Whisper...");
    try {
      const result = await transcribeAudio(
        fileRef.current,
        fileRef.current.name,
      );
      setTranscript(result.text || "No speech was detected.");
      setMessage(
        `Transcription complete. Detected language: ${result.language}.`,
      );
    } catch (error) {
      setMessage(`Transcription unavailable: ${error.message}`);
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
          Choose MP3
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          onChange={handleFileChange}
          hidden
        />
        {previewUrl && (
          <audio className="audio-upload__audio" controls src={previewUrl} />
        )}
        {previewUrl && (
          <button
            type="button"
            className="audio-upload__button"
            onClick={handleTranscribe}
            disabled={transcribing}
          >
            {transcribing ? "Transcribing..." : "Transcribe"}
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
